const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CheckboxBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RadioGroupBuilder,
  RadioGroupOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { ComponentsV2Builder, V2Text } = require("gralonium");
const { generateText, generateVision, transcribeMedia } = require("./ai");
const { getMessageText } = require("./adapter");
const { GREEN, RED, YELLOW } = require("./config");
const { getLang, logAction, resolveContextLang } = require("./guild");
const { getCurrentLang, runWithLang, translatePayload, wrapInteractionForLang } = require("./i18n");
const {
  addModCase,
  addWarn,
  applyWarnEscalation,
  formatDuration,
  generateId,
  listUnifiedHistoryForUser,
  parseDuration,
} = require("./moderation");
const { createReminder } = require("./reminders");
const { Logger } = require("./runtime");

const log = new Logger("CONTEXT_MENU", process.env.LOG_LEVEL);

const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const LANG_NAMES = {
  auto: "Automático",
  es: "Español",
  en: "Inglés",
  pt: "Portugués",
  fr: "Francés",
  de: "Alemán",
  it: "Italiano",
  ja: "Japonés",
  ko: "Coreano",
  "zh-cn": "Chino",
  "zh-tw": "Chino tradicional",
  ru: "Ruso",
  ar: "Árabe",
  nl: "Neerlandés",
};

const formatLang = (code) => {
  const key = V2Text.clip(code, 40, "");
  const label = LANG_NAMES[key.toLowerCase()];
  if (!label) return key || "desconocido";
  return key.toLowerCase() === "auto" ? label : `${label} (${key})`;
};

function getMessageSources(message) {
  return [
    message,
    ...(message?.messageSnapshots?.values ? [...message.messageSnapshots.values()] : []),
  ];
}

function extractContextImage(message) {
  for (const src of getMessageSources(message)) {
    const atts = [...(src?.attachments?.values?.() ?? [])];
    for (const att of atts) {
      const ct = att?.contentType ?? "";
      const name = att?.name ?? "";
      if (VALID_IMAGE_TYPES.some((t) => ct.startsWith(t)) || /\.(png|jpe?g|gif|webp)$/i.test(name)) {
        return { url: att.url, name: att.name ?? "imagen", contentType: ct, size: att.size ?? 0 };
      }
    }
    const embedImg = src?.embeds?.[0]?.image?.url ?? src?.embeds?.[0]?.thumbnail?.url;
    if (embedImg) {
      return { url: embedImg, name: "imagen", contentType: "image/png", size: 0 };
    }
  }
  return null;
}

function extractContextMedia(message) {
  for (const src of getMessageSources(message)) {
    const atts = [...(src?.attachments?.values?.() ?? [])];
    for (const att of atts) {
      const ct = att?.contentType ?? "";
      const name = att?.name ?? "";
      if (
        ct.startsWith("audio/") ||
        ct.startsWith("video/") ||
        /\.(mp3|mp4|wav|ogg|webm|m4a|flac|mov)$/i.test(name)
      ) {
        return {
          url: att.url,
          name: att.name ?? (ct.startsWith("video/") ? "video.mp4" : "voice-message.ogg"),
          contentType: ct,
          size: att.size ?? 0,
        };
      }
    }
  }
  return null;
}

const INTERACTION_I18N_WRAPPED = Symbol.for("redbot.interactionI18nWrapped");

async function replyEphemeral(interaction, payload) {
  const isBuilder = typeof payload?.toPayload === "function";
  const raw = typeof payload === "string"
    ? { content: payload, flags: MessageFlags.Ephemeral }
    : isBuilder
      ? payload.toPayload({ ephemeral: true })
      : { ...payload, flags: MessageFlags.Ephemeral };
  const data = isBuilder || interaction?.[INTERACTION_I18N_WRAPPED]
    ? raw
    : translatePayload(raw, getCurrentLang());

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(data).catch(() => interaction.followUp(data).catch(() => null));
  }
  return interaction.reply(data).catch(() => null);
}

async function runEphemeralTask(interaction, label, fn) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await fn();
  } catch (err) {
    log.error(label, { err: err?.message ?? String(err) });
    await replyEphemeral(interaction, "Ocurrió un error procesando la acción");
  }
}

async function handleTranslateContext(interaction) {
  await runEphemeralTask(interaction, "[ctx translate]", async () => {
    const text = getMessageText(interaction.targetMessage);
    if (!text) {
      return replyEphemeral(interaction, "Este mensaje no tiene texto para traducir");
    }

    const { getCurrentLang } = require("./i18n");
    const defaultTarget = getCurrentLang();
    const { translate } = require("@vitalets/google-translate-api");
    let res = await translate(text.slice(0, 3000), { to: defaultTarget });
    let targetLang = defaultTarget;

    if (res?.raw?.src?.toLowerCase() === defaultTarget) {
      targetLang = defaultTarget === "en" ? "es" : "en";
      res = await translate(text.slice(0, 3000), { to: targetLang });
    }

    if (!res?.text) {
      return replyEphemeral(interaction, "No se pudo generar la traducción");
    }

    const origen = res.raw?.src ?? "auto";
    const card = new ComponentsV2Builder({ color: RED })
      .addText(`${V2Text.heading("Traducción", 3)}\n${V2Text.subtext(`${formatLang(origen)} → ${formatLang(targetLang)}`)}`)
      .addSeparator("small")
      .addText(`**Original**\n${V2Text.quote(text, 1200)}`)
      .addSpacer("small")
      .addText(`**Resultado**\n${V2Text.quote(res.text, 2000)}`);

    await replyEphemeral(interaction, card);
  });
}

async function handleOcrContext(interaction) {
  await runEphemeralTask(interaction, "[ctx ocr]", async () => {
    const img = extractContextImage(interaction.targetMessage);
    if (!img) {
      return replyEphemeral(interaction, "Este mensaje no contiene una imagen válida");
    }
    if (img.size > 8 * 1024 * 1024) {
      return replyEphemeral(interaction, "La imagen no puede superar los 8MB");
    }

    const prompt =
      "Extrae todo el texto visible en esta imagen tal como aparece, respetando los saltos de línea. " +
      "No traduzcas, no describas la imagen y no agregues comentarios. Si no hay texto legible responde únicamente: SIN_TEXTO";
    const texto = await generateVision(prompt, img.url);

    if (!texto || texto.includes("SIN_TEXTO")) {
      return replyEphemeral(interaction, "No se detectó texto legible en la imagen");
    }

    const card = new ComponentsV2Builder({ color: RED })
      .addSection([V2Text.heading("Texto extraído", 3)], { thumbnail: img.url, fallbackToText: true })
      .addSeparator("small")
      .addSmartText(texto, {
        maxLength: 3600,
        overflow: "file",
        filename: "texto.txt",
        preview: false,
        overflowNotice: "El texto supera el límite del mensaje, se adjunta como archivo.",
      });

    await replyEphemeral(interaction, card);
  });
}

async function handleResumeContext(interaction) {
  await runEphemeralTask(interaction, "[ctx resume]", async () => {
    const text = getMessageText(interaction.targetMessage);
    if (!text) {
      return replyEphemeral(interaction, "Este mensaje no tiene texto para resumir");
    }
    if (text.length < 60) {
      return replyEphemeral(interaction, "El mensaje es demasiado corto para resumir");
    }

    const isEn = require("./i18n").getCurrentLang() === "en";
    const resumen = await generateText(
      isEn
        ? `Summarize the following text. Only provide the summary, with no introductory phrases or extra commentary. Stay objective and faithful to the original content, without opinions or interpretations. Respond in English.\n\n${text.slice(0, 8000)}`
        : `Resume el siguiente texto. Solo el resumen, sin frases previas ni comentarios adicionales. Objetivo, fiel al contenido original, sin opiniones ni interpretaciones. Responde en español.\n\n${text.slice(0, 8000)}`
    );

    const card = new ComponentsV2Builder({ color: RED })
      .addText(`${V2Text.heading("Resumen", 3)}\n${V2Text.subtext(`${text.length} → ${(resumen ?? "").length} caracteres`)}`)
      .addSeparator("small")
      .addSmartText(resumen || "No pude generar un resumen", { overflow: "clip" });

    await replyEphemeral(interaction, card);
  });
}

async function handleTranscribeContext(interaction) {
  await runEphemeralTask(interaction, "[ctx transcribe]", async () => {
    const media = extractContextMedia(interaction.targetMessage);
    if (!media) {
      return replyEphemeral(interaction, "Este mensaje no contiene un audio o video válido");
    }

    const res = await transcribeMedia(media);
    if (res.error === "unsupported") {
      return replyEphemeral(interaction, "Formato no soportado. Usa: mp3, wav, ogg, webm, mp4, m4a, flac, mov");
    }
    if (res.error === "too_large") {
      return replyEphemeral(interaction, "El archivo no puede superar los 25MB");
    }
    if (!res.text) {
      return replyEphemeral(interaction, "No se detectó voz inteligible en el archivo");
    }

    const { getCurrentLang } = require("./i18n");
    const card = new ComponentsV2Builder({ color: RED })
      .addText(`${V2Text.heading("Transcripción", 3)}\n${V2Text.subtext(V2Text.clip(media.name, 80))}`)
      .addSeparator("small")
      .addSmartText(res.text, {
        maxLength: 3600,
        overflow: "file",
        filename: getCurrentLang() === "en" ? "transcription.txt" : "transcripcion.txt",
        preview: false,
        overflowNotice: "El texto supera el límite del mensaje, se adjunta como archivo.",
      });

    await replyEphemeral(interaction, card);
  });
}

async function handleRemindContext(client, interaction) {
  const targetMsg = interaction.targetMessage;
  const preview = V2Text.clip(getMessageText(targetMsg) || "(Mensaje sin texto)", 140);
  const modalId = `ctx_remind:${targetMsg.id}:${Date.now().toString(36)}`;

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle("Recordar mensaje")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("¿Cuándo quieres el recordatorio?")
        .setRadioGroupComponent(
          new RadioGroupBuilder()
            .setCustomId("preset")
            .setRequired(true)
            .addOptions(
              new RadioGroupOptionBuilder().setLabel("En 15 minutos").setValue("15m").setDefault(true),
              new RadioGroupOptionBuilder().setLabel("En 1 hora").setValue("1h"),
              new RadioGroupOptionBuilder().setLabel("Mañana (24 horas)").setValue("24h"),
              new RadioGroupOptionBuilder().setLabel("Tiempo personalizado (escríbelo abajo)").setValue("custom")
            )
        ),
      new LabelBuilder()
        .setLabel("Tiempo personalizado")
        .setDescription("Solo si elegiste la opción personalizada")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("custom_time")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(16)
            .setPlaceholder("Ej: 30m, 4h, 2d")
        ),
      new LabelBuilder()
        .setLabel("Nota adicional (opcional)")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("note")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(250)
            .setPlaceholder("Ej: Responder a este mensaje")
        )
    );

  await interaction.showModal(modal);

  const submitted = await interaction
    .awaitModalSubmit({
      time: 3 * 60_000,
      filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
    })
    .catch(() => null);
  if (!submitted) return;

  await submitted.deferReply({ flags: MessageFlags.Ephemeral });

  const preset = submitted.fields.getRadioGroup("preset");
  const customTime = submitted.fields.getTextInputValue("custom_time")?.trim() ?? "";
  const note = submitted.fields.getTextInputValue("note")?.trim() ?? "";

  const durationStr = preset === "custom" ? customTime : preset;
  const duration = parseDuration(durationStr);

  if (!duration || duration < 10_000 || duration > 365 * 86_400_000) {
    return replyEphemeral(submitted, "Tiempo inválido. Usa `30s`, `10m`, `2h`, `1d` o `1w` (entre 10s y 365d)");
  }

  const isEn = require("./i18n").getCurrentLang() === "en";
  const remindAt = new Date(Date.now() + duration);
  const msgLink = targetMsg.url ? `[${isEn ? "Jump to message" : "Ir al mensaje"}](${targetMsg.url})` : "";
  const bodyParts = [
    note || (isEn
      ? `Reminder about message from **${targetMsg.author?.username ?? "user"}**`
      : `Recordatorio de mensaje de **${targetMsg.author?.username ?? "usuario"}**`),
    preview !== "(Mensaje sin texto)" ? `> ${preview}` : "",
    msgLink,
  ].filter(Boolean);

  const text = bodyParts.join("\n").slice(0, 500);
  const res = await createReminder(client, {
    userId: interaction.user.id,
    guildId: interaction.guildId ?? null,
    channelId: interaction.channelId ?? null,
    text,
    remindAt,
  });

  if (res.error === "limit") {
    return replyEphemeral(submitted, `Ya tienes ${res.max} recordatorios pendientes, espera a que alguno se cumpla`);
  }

  const ts = Math.floor(remindAt.getTime() / 1000);
  const card = new ComponentsV2Builder({ color: GREEN })
    .addText(`${V2Text.heading("Recordatorio creado", 3)}\n${V2Text.subtext(`<t:${ts}:f> · <t:${ts}:R>`)}`)
    .addSeparator("small")
    .addText(text);

  await replyEphemeral(submitted, card);
}

const CASE_TYPE_LABELS = {
  warn: "Warn",
  mute: "Mute",
  auto_mute: "Auto-Mute",
  unmute: "Unmute",
  kick: "Kick",
  ban: "Ban",
  tempban: "Tempban",
  softban: "Softban",
  unban: "Unban",
};

function buildDossierPayload({ targetUser, member, cases = [], modMember, guild, ids }) {
  const history = Array.isArray(cases) ? cases : [];
  const warnsCount = history.filter((c) => !c.type || c.type === "warn").length;
  const createdTs = Math.floor(targetUser.createdTimestamp / 1000);
  const joinedTs = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
  const isMuted = Boolean(member?.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now());
  const canTarget =
    !targetUser.bot &&
    targetUser.id !== modMember.id &&
    targetUser.id !== guild.ownerId &&
    (modMember.id === guild.ownerId || (member && (member.roles?.highest?.position ?? 0) < (modMember.roles?.highest?.position ?? 0)));

  const recentCases = history.slice(0, 4).map((c) => {
    const ts = Math.floor(new Date(c.createdAt).getTime() / 1000);
    const idCode = c.caseId ?? "N/A";
    const typeLabel = c.type ? (CASE_TYPE_LABELS[c.type] ?? c.type) : "Warn";
    const durSuffix = c.durationMs ? ` ${formatDuration(c.durationMs)}` : "";
    return `• **[${typeLabel}${durSuffix}] \`${idCode}\`** (<t:${ts}:d>): ${V2Text.clip(c.reason, 110, "Sin razón")}`;
  });

  const builder = new ComponentsV2Builder({ color: history.length ? YELLOW : RED })
    .addSection(
      [
        V2Text.heading(`Expediente: ${V2Text.clip(targetUser.tag ?? targetUser.username, 100)}`, 3),
        V2Text.sectionBlock("Resumen", [
          ["ID", V2Text.code(targetUser.id)],
          ["Cuenta creada", `<t:${createdTs}:R>`],
          ["Ingreso", joinedTs ? `<t:${joinedTs}:R>` : "Fuera del servidor"],
          ["Sanciones / Warns", `${V2Text.code(history.length)} (${V2Text.code(warnsCount)} warns)`],
          isMuted ? ["Mute activo", `Hasta <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`] : null,
        ]),
      ],
      { thumbnail: targetUser.displayAvatarURL({ size: 256 }), fallbackToText: true }
    )
    .addSeparator("small")
    .addText(`**Historial reciente**\n${recentCases.length ? recentCases.join("\n") : "Sin sanciones registradas"}`);

  if (canTarget && member && ids) {
    builder.addSpacer("small").addComponent(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(ids.warn).setLabel("Advertir").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(ids.mute).setLabel("Mute 10m").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(ids.kick)
          .setLabel("Expulsar")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!modMember.permissions.has(PermissionFlagsBits.KickMembers))
      )
    );
  }

  return builder.toPayload({ ephemeral: true });
}

async function handleModDossierContext(interaction) {
  if (!interaction.guild || !interaction.member) {
    return replyEphemeral(interaction, "Este comando solo se puede usar en servidores");
  }
  if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return replyEphemeral(interaction, "No tienes permisos para usar esta acción, necesitas: `ModerateMembers`");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const guild = interaction.guild;
    const targetUser = interaction.targetUser;
    const member =
      interaction.targetMember ??
      guild.members?.cache?.get?.(targetUser.id) ??
      (await guild.members?.fetch?.(targetUser.id).catch(() => null));

    const cases = await listUnifiedHistoryForUser({ guildId: guild.id, userId: targetUser.id });
    const session = interaction.id;
    const ids = {
      warn: `modctx:warn:${session}`,
      mute: `modctx:mute:${session}`,
      kick: `modctx:kick:${session}`,
    };

    const payload = buildDossierPayload({ targetUser, member, cases, modMember: interaction.member, guild, ids });
    const msg = await interaction.editReply(payload);

    if (!msg || typeof msg.createMessageComponentCollector !== "function") return;

    const collector = msg.createMessageComponentCollector({
      time: 3 * 60_000,
      filter: (i) => i.user.id === interaction.user.id && Object.values(ids).includes(i.customId),
    });

    collector.on("collect", async (btn) => {
      const lang = guild?.id ? await getLang(guild.id).catch(() => getCurrentLang()) : getCurrentLang();
      return runWithLang(lang, async () => {
        wrapInteractionForLang(btn, lang);
        try {
          if (btn.customId === ids.mute) {
            const btnPerms = btn.memberPermissions ?? interaction.member.permissions;
            if (!btnPerms?.has?.(PermissionFlagsBits.ModerateMembers)) {
              return btn.reply({ content: "No tienes el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
            if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
              return btn.reply({ content: "No tengo el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            if (!member?.moderatable) {
              return btn.reply({ content: "No puedo silenciar a este usuario (jerarquía)", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            await btn.deferUpdate();
            await member.timeout(10 * 60_000, `Mute rápido desde expediente por ${interaction.user.tag}`);
            await addModCase({
              guildId: guild.id,
              userId: targetUser.id,
              moderatorId: interaction.user.id,
              type: "mute",
              reason: "Mute rápido desde expediente",
              durationMs: 10 * 60_000,
            });
            await logAction(guild, {
              title: "Usuario silenciado (Expediente)",
              color: YELLOW,
              fields: [
                { name: "Usuario", value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
                { name: "Moderador", value: interaction.user.tag, inline: true },
                { name: "Duración", value: "10m", inline: true },
              ],
            });
            const refreshed = await listUnifiedHistoryForUser({ guildId: guild.id, userId: targetUser.id });
            await btn.editReply(buildDossierPayload({ targetUser, member, cases: refreshed, modMember: interaction.member, guild, ids }));
            return;
          }

          const isKick = btn.customId === ids.kick;
          const modalId = `modctx_modal:${isKick ? "kick" : "warn"}:${btn.id}`;
          const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(isKick ? `Expulsar a ${V2Text.clip(targetUser.username, 25)}` : `Advertir a ${V2Text.clip(targetUser.username, 25)}`)
            .addLabelComponents(
              new LabelBuilder()
                .setLabel("Razón")
                .setTextInputComponent(
                  new TextInputBuilder()
                    .setCustomId("razon")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(300)
                    .setPlaceholder("Escribe el motivo...")
                ),
              new LabelBuilder()
                .setLabel("Notificar al usuario por DM")
                .setCheckboxComponent(new CheckboxBuilder().setCustomId("notify_dm").setDefault(true))
            );

          await btn.showModal(modal);
          const sub = await btn
            .awaitModalSubmit({
              time: 2 * 60_000,
              filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
            })
            .catch(() => null);
          if (!sub) return;

          const reason = sub.fields.getTextInputValue("razon")?.trim() || "Sin razón";
          const notifyDm = sub.fields.getCheckbox("notify_dm");
          const currentPerms = sub.memberPermissions ?? btn.memberPermissions ?? interaction.member.permissions;

          if (isKick) {
            if (!currentPerms?.has?.(PermissionFlagsBits.KickMembers)) {
              return sub.reply({ content: "No tienes el permiso `KickMembers`", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            if (!member?.kickable) {
              return sub.reply({ content: "No puedo expulsar a este usuario (jerarquía o permisos)", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            await sub.deferReply({ flags: MessageFlags.Ephemeral });
            if (notifyDm) {
              await targetUser.send({
                content: `Fuiste expulsado de **${guild.name}**\nRazón: ${reason}`,
              }).catch(() => {});
            }
            await member.kick(`${interaction.user.tag}: ${reason}`);
            await addModCase({
              guildId: guild.id,
              userId: targetUser.id,
              moderatorId: interaction.user.id,
              type: "kick",
              reason,
            });
            await logAction(guild, {
              title: "Usuario expulsado (Expediente)",
              color: RED,
              fields: [
                { name: "Usuario", value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
                { name: "Moderador", value: interaction.user.tag, inline: true },
                { name: "Razón", value: reason, inline: false },
              ],
            });
            await sub.editReply({ content: `**${targetUser.tag}** fue expulsado.` }).catch(() => {});
            collector.stop("kicked");
            return;
          }

          if (!currentPerms?.has?.(PermissionFlagsBits.ModerateMembers)) {
            return sub.reply({ content: "No tienes el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          await sub.deferUpdate().catch(() => {});
          const warnId = generateId();
          const { total } = await addWarn({
            guildId: guild.id,
            userId: targetUser.id,
            moderatorId: interaction.user.id,
            reason,
            warnId,
          });
          if (notifyDm) {
            await targetUser.send({
              content: `Fuiste advertido en **${guild.name}**\nRazón: ${reason}\nTotal warns: \`${total}\` · ID: \`${warnId}\``,
            }).catch(() => {});
          }
          if (member) await applyWarnEscalation(guild, member, total);
          await logAction(guild, {
            title: "Usuario Advertido (Expediente)",
            color: YELLOW,
            fields: [
              { name: "Usuario", value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
              { name: "Moderador", value: interaction.user.tag, inline: true },
              { name: "ID", value: `\`${warnId}\``, inline: true },
              { name: "Total warns", value: `${total}`, inline: true },
              { name: "Razón", value: reason, inline: false },
            ],
          });
          const refreshed = await listUnifiedHistoryForUser({ guildId: guild.id, userId: targetUser.id });
          await sub.editReply(buildDossierPayload({ targetUser, member, cases: refreshed, modMember: interaction.member, guild, ids })).catch(async () => {
            await sub.followUp({ content: `Advertencia \`${warnId}\` aplicada (total: \`${total}\`).`, flags: MessageFlags.Ephemeral }).catch(() => {});
          });
        } catch (btnErr) {
          log.error("[ctx mod action]", { err: btnErr?.message ?? String(btnErr) });
          if (!btn.replied && !btn.deferred) {
            await btn.reply({ content: "No se pudo ejecutar la acción", flags: MessageFlags.Ephemeral }).catch(() => {});
          }
        }
      });
    });
  } catch (err) {
    log.error("[ctx mod]", { err: err?.message ?? String(err) });
    await replyEphemeral(interaction, "No se pudo cargar el expediente del usuario");
  }
}

function withContextLang(handler) {
  return async function (...args) {
    const interaction = args.length >= 2 ? args[1] : args[0];
    const lang = await resolveContextLang({
      guildId: interaction?.guildId ?? null,
      userId: interaction?.user?.id ?? null,
      locale: interaction?.locale ?? interaction?.guildLocale ?? null,
    }).catch(() => "es");
    wrapInteractionForLang(interaction, lang);
    return runWithLang(lang, () => handler(...args));
  };
}

module.exports = {
  handleTranslateContext: withContextLang(handleTranslateContext),
  handleOcrContext: withContextLang(handleOcrContext),
  handleTranscribeContext: withContextLang(handleTranscribeContext),
  handleResumeContext: withContextLang(handleResumeContext),
  handleRemindContext: withContextLang(handleRemindContext),
  handleModDossierContext: withContextLang(handleModDossierContext),
};
