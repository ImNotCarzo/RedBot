const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
const { generateText, generateVision } = require("./ai");
const { getMessageText } = require("./adapter");
const { GREEN, RED, YELLOW } = require("./config");
const { logAction } = require("./guild");
const { addWarn, generateId, listWarnsForUser, parseDuration } = require("./moderation");
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

function extractContextImage(message) {
  const sources = [
    message,
    ...(message?.messageSnapshots?.values ? [...message.messageSnapshots.values()] : []),
  ];

  for (const src of sources) {
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

async function replyEphemeral(interaction, payload) {
  const data = typeof payload === "string"
    ? { content: payload, flags: MessageFlags.Ephemeral }
    : typeof payload?.toPayload === "function"
      ? payload.toPayload({ ephemeral: true })
      : { ...payload, flags: MessageFlags.Ephemeral };

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

    const { translate } = require("@vitalets/google-translate-api");
    let res = await translate(text.slice(0, 3000), { to: "es" });
    let targetLang = "es";

    if (res?.raw?.src?.toLowerCase() === "es") {
      res = await translate(text.slice(0, 3000), { to: "en" });
      targetLang = "en";
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

    const resumen = await generateText(
      `Resume el siguiente texto. Solo el resumen, sin frases previas ni comentarios adicionales. Objetivo, fiel al contenido original, sin opiniones ni interpretaciones. Responde en español.\n\n${text.slice(0, 8000)}`
    );

    const card = new ComponentsV2Builder({ color: RED })
      .addText(`${V2Text.heading("Resumen", 3)}\n${V2Text.subtext(`${text.length} → ${(resumen ?? "").length} caracteres`)}`)
      .addSeparator("small")
      .addSmartText(resumen || "No pude generar un resumen", { overflow: "clip" });

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

  const remindAt = new Date(Date.now() + duration);
  const msgLink = targetMsg.url ? `[Ir al mensaje](${targetMsg.url})` : "";
  const bodyParts = [
    note || `Recordatorio de mensaje de **${targetMsg.author?.username ?? "usuario"}**`,
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

function buildDossierPayload({ targetUser, member, warns, modMember, guild, ids }) {
  const createdTs = Math.floor(targetUser.createdTimestamp / 1000);
  const joinedTs = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
  const isMuted = Boolean(member?.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now());
  const canTarget =
    !targetUser.bot &&
    targetUser.id !== modMember.id &&
    targetUser.id !== guild.ownerId &&
    (modMember.id === guild.ownerId || (member && member.roles.highest.position < modMember.roles.highest.position));

  const recentWarns = warns.slice(0, 3).map((w) => {
    const ts = Math.floor(new Date(w.createdAt).getTime() / 1000);
    return `• **\`${w.warnId}\`** (<t:${ts}:d>): ${V2Text.clip(w.reason, 120, "Sin razón")}`;
  });

  const builder = new ComponentsV2Builder({ color: warns.length ? YELLOW : RED })
    .addSection(
      [
        V2Text.heading(`Expediente: ${V2Text.clip(targetUser.tag ?? targetUser.username, 100)}`, 3),
        V2Text.sectionBlock("Resumen", [
          ["ID", V2Text.code(targetUser.id)],
          ["Cuenta creada", `<t:${createdTs}:R>`],
          ["Ingreso", joinedTs ? `<t:${joinedTs}:R>` : "Fuera del servidor"],
          ["Warns totales", V2Text.code(warns.length)],
          isMuted ? ["Mute activo", `Hasta <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`] : null,
        ]),
      ],
      { thumbnail: targetUser.displayAvatarURL({ size: 256 }), fallbackToText: true }
    )
    .addSeparator("small")
    .addText(`**Últimas advertencias**\n${recentWarns.length ? recentWarns.join("\n") : "Sin advertencias registradas"}`);

  if (canTarget && member && ids) {
    builder.addSpacer("small").addComponent(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(ids.warn).setLabel("Advertir").setStyle(ButtonStyle.Primary),
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
      guild.members.cache.get(targetUser.id) ??
      (await guild.members.fetch(targetUser.id).catch(() => null));

    const warns = await listWarnsForUser({ guildId: guild.id, userId: targetUser.id });
    const session = Date.now().toString(36);
    const ids = {
      warn: `modctx:warn:${session}`,
      mute: `modctx:mute:${session}`,
      kick: `modctx:kick:${session}`,
    };

    const payload = buildDossierPayload({ targetUser, member, warns, modMember: interaction.member, guild, ids });
    const msg = await interaction.editReply(payload);

    if (!msg || typeof msg.createMessageComponentCollector !== "function") return;

    const collector = msg.createMessageComponentCollector({
      time: 3 * 60_000,
      filter: (i) => i.user.id === interaction.user.id && Object.values(ids).includes(i.customId),
    });

    collector.on("collect", async (btn) => {
      try {
        if (btn.customId === ids.mute) {
          const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
          if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return btn.reply({ content: "No tengo el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          if (!member?.moderatable) {
            return btn.reply({ content: "No puedo silenciar a este usuario (jerarquía)", flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          await member.timeout(10 * 60_000, `Mute rápido desde expediente por ${interaction.user.tag}`);
          await logAction(guild, {
            title: "Usuario silenciado (Expediente)",
            color: YELLOW,
            fields: [
              { name: "Usuario", value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
              { name: "Moderador", value: interaction.user.tag, inline: true },
              { name: "Duración", value: "10m", inline: true },
            ],
          });
          const refreshed = await listWarnsForUser({ guildId: guild.id, userId: targetUser.id });
          await btn.update(buildDossierPayload({ targetUser, member, warns: refreshed, modMember: interaction.member, guild, ids }));
          return;
        }

        const isKick = btn.customId === ids.kick;
        const modalId = `modctx_modal:${isKick ? "kick" : "warn"}:${Date.now().toString(36)}`;
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
              )
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

        if (isKick) {
          if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return sub.reply({ content: "No tienes el permiso `KickMembers`", flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          if (!member?.kickable) {
            return sub.reply({ content: "No puedo expulsar a este usuario (jerarquía o permisos)", flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          await member.kick(`${interaction.user.tag}: ${reason}`);
          await logAction(guild, {
            title: "Usuario expulsado (Expediente)",
            color: RED,
            fields: [
              { name: "Usuario", value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
              { name: "Moderador", value: interaction.user.tag, inline: true },
              { name: "Razón", value: reason, inline: false },
            ],
          });
          await sub.reply({ content: `**${targetUser.tag}** fue expulsado.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          collector.stop("kicked");
          return;
        }

        const warnId = generateId();
        const { total } = await addWarn({
          guildId: guild.id,
          userId: targetUser.id,
          moderatorId: interaction.user.id,
          reason,
          warnId,
        });
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
        const refreshed = await listWarnsForUser({ guildId: guild.id, userId: targetUser.id });
        await sub.update(buildDossierPayload({ targetUser, member, warns: refreshed, modMember: interaction.member, guild, ids })).catch(async () => {
          await sub.reply({ content: `Advertencia \`${warnId}\` aplicada (total: \`${total}\`).`, flags: MessageFlags.Ephemeral }).catch(() => {});
        });
      } catch (btnErr) {
        log.error("[ctx mod action]", { err: btnErr?.message ?? String(btnErr) });
        if (!btn.replied && !btn.deferred) {
          await btn.reply({ content: "No se pudo ejecutar la acción", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }
    });
  } catch (err) {
    log.error("[ctx mod]", { err: err?.message ?? String(err) });
    await replyEphemeral(interaction, "No se pudo cargar el expediente del usuario");
  }
}

module.exports = {
  handleTranslateContext,
  handleOcrContext,
  handleResumeContext,
  handleRemindContext,
  handleModDossierContext,
};
