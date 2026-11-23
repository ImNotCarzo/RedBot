const {
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  FileUploadBuilder,
  Routes,
} = require("discord.js");
const {
  GroupBuilder,
  CommandBuilder,
  ParamsBuilder,
  Plugins,
  ComponentsV2Builder,
  MessageFlags,
  V2Text,
  V2View,
} = require("gralonium");
const {
  Logger,
  noGuildReply,
  handleCommandError,
  createListPaginator,
  formatSortedRoles,
  failWith,
  isObfuscatedChannel,
} = require("../../src/runtime");
const { buildImageCard, slicePage } = require("../../src/shared/ui");
const { MAX_IMAGE_SIZE_BYTES, VALID_IMAGE_TYPES, fetchBotMember } = require("../../src/shared/utils");
const { RED, GREEN } = require("../../src/config");
const { logAction } = require("../../src/guild");
const { fetchPublic, readBodyLimited } = require("../../src/security");
const { recordImageIfNew, replyWithImageHistory } = require("../../src/history");
const { sendServerSetupPanel } = require("../../src/panels");

const PAGE_SIZE = 15;
const RESET_SCOPE_ALIASES = {
  todo: "todo",
  all: "todo",
  avatar: "avatar",
  pfp: "avatar",
  banner: "banner",
  biografia: "biografia",
  bio: "biografia",
  apodo: "apodo",
  nick: "apodo",
};
const RESET_SCOPE_LABELS = {
  todo: "Todo (avatar, banner, biografía y apodo)",
  avatar: "Avatar",
  banner: "Banner",
  biografia: "Biografía",
  apodo: "Apodo",
};
const VERIFICATION_LEVELS = { 0: "Ninguno", 1: "Bajo", 2: "Medio", 3: "Alto", 4: "Muy alto" };
const log = new Logger("CMD_SERVER");

async function fetchBotImageBuffer(attachment, label) {
  if (!attachment) return { buffer: undefined };
  if (attachment.contentType && !VALID_IMAGE_TYPES.some((t) => attachment.contentType.toLowerCase().startsWith(t))) {
    return { error: `El archivo de **${label}** debe ser una imagen válida (jpg, png, gif, webp)` };
  }
  if (attachment.size > MAX_IMAGE_SIZE_BYTES) {
    return { error: `La imagen de **${label}** no puede superar los 8MB` };
  }

  const res = await fetchPublic(attachment.url, {}, 15_000);
  if (!res.ok) {
    throw new Error(`No se pudo descargar la imagen de ${label} (${res.status})`);
  }

  const resType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (resType && !VALID_IMAGE_TYPES.some((t) => resType.startsWith(t))) {
    return { error: `El archivo de **${label}** debe ser una imagen válida (jpg, png, gif, webp)` };
  }

  const body = await readBodyLimited(res, MAX_IMAGE_SIZE_BYTES);
  if (body.tooLarge) {
    return { error: `La imagen de **${label}** no puede superar los 8MB` };
  }

  const mimeType = resType || attachment.contentType?.split(";")[0].trim().toLowerCase() || "image/png";
  return { buffer: body.buffer, mimeType };
}

function mapCustomBotApiError(err) {
  const msg = err?.message ?? String(err);
  if (err?.status === 429 || err?.code === 50035 || /rate limit|too fast|avatar/i.test(msg)) {
    return "Intenta de nuevo en unos minutos.";
  }
  if (err?.code === 50013) {
    return "No tengo permisos suficientes en este servidor.";
  }
  return null;
}

async function patchGuildBotProfile(guild, payload, reason) {
  if (typeof guild.client?.rest?.patch === "function") {
    const restBody = { ...payload };
    if (Buffer.isBuffer(restBody.avatar?.buffer)) {
      restBody.avatar = `data:${restBody.avatar.mimeType};base64,${restBody.avatar.buffer.toString("base64")}`;
    }
    if (Buffer.isBuffer(restBody.banner?.buffer)) {
      restBody.banner = `data:${restBody.banner.mimeType};base64,${restBody.banner.buffer.toString("base64")}`;
    }
    const rawMember = await guild.client.rest.patch(Routes.guildMember(guild.id, "@me"), {
      body: restBody,
      reason,
    });
    const updatedMe = await fetchBotMember(guild, { force: true });
    return { updatedMe, bio: rawMember?.bio ?? undefined };
  }

  const editPayload = { ...payload };
  if (Buffer.isBuffer(editPayload.avatar?.buffer)) editPayload.avatar = editPayload.avatar.buffer;
  if (Buffer.isBuffer(editPayload.banner?.buffer)) editPayload.banner = editPayload.banner.buffer;
  await guild.members.editMe({ ...editPayload, reason });
  const updatedMe = await fetchBotMember(guild, { force: true });
  return { updatedMe, bio: undefined };
}

function buildCustomBotCard({ updatedMe, bioValue = null, moderator }) {
  const serverAvatarUrl = updatedMe?.avatarURL?.({ size: 512, extension: "png" }) ?? null;
  const serverBannerUrl = updatedMe?.bannerURL?.({ size: 1024, extension: "png" }) ?? null;
  const displayAvatar = updatedMe?.displayAvatarURL?.({ size: 512, extension: "png" }) ?? null;
  const displayBanner = updatedMe?.displayBannerURL?.({ size: 1024, extension: "png" }) ?? null;

  const avatarLabel = updatedMe?.avatar
    ? (serverAvatarUrl ? `[Nuevo](${serverAvatarUrl})` : "Nuevo")
    : "Por Defecto";
  const nickLabel = updatedMe?.nickname ? updatedMe.nickname : "Por Defecto";
  const bannerLabel = updatedMe?.banner
    ? (serverBannerUrl ? `[Nuevo](${serverBannerUrl})` : "Nuevo")
    : "Por Defecto";
  const bioLabel = bioValue ? V2Text.clip(bioValue, 190) : "Por Defecto";

  const builder = new ComponentsV2Builder({ color: GREEN }).addSection(
    [
      V2Text.heading("Cambios aplicados", 3),
      [
        `Avatar: ${avatarLabel}`,
        `Apodo: ${nickLabel}`,
        `Banner: ${bannerLabel}`,
        `Biografia: ${bioLabel}`,
      ].join("\n"),
    ],
    { thumbnail: displayAvatar, fallbackToText: true }
  );

  if (displayBanner) builder.addGallery(displayBanner);
  if (moderator) {
    builder.addText(V2Text.subtext(moderator.globalName || moderator.username || moderator.tag, 120));
  }
  return builder;
}

function buildCustomBotStatusCard(me, guild, { isEnded = false, controls = null } = {}) {
  const builder = new ComponentsV2Builder({ color: RED }).addSection(
    [
      V2Text.heading("Perfil en el servidor", 3),
      V2Text.subtext(guild.name, 120),
    ],
    {
      thumbnail: me?.displayAvatarURL?.({ size: 256, extension: "png" }) ?? null,
      fallbackToText: true,
    }
  );

  builder
    .addSeparator("small")
    .addFields([
      ["Apodo", V2Text.code(me?.nickname ?? "Sin apodo")],
      ["Avatar del servidor", V2Text.code(me?.avatar ? "Personalizado" : "Global")],
      ["Banner del servidor", V2Text.code(me?.banner ? "Personalizado" : "Global")],
    ]);

  const bannerUrl = me?.displayBannerURL?.({ size: 1024, extension: "png" }) ?? null;
  if (bannerUrl) builder.addGallery(bannerUrl);

  if (!isEnded && controls?.length) {
    builder.addSpacer("small").addButtonsRow(controls);
  }

  return builder;
}

function buildCustomBotModal(modalId) {
  return new ModalBuilder()
    .setCustomId(modalId)
    .setTitle("Perfil en el servidor")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Apodo")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("apodo")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(32)
            .setRequired(false)
            .setPlaceholder("Dejar vacío para no cambiar")
        ),
      new LabelBuilder()
        .setLabel("Biografía")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("biografia")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(190)
            .setRequired(false)
            .setPlaceholder("Dejar vacío para no cambiar")
        ),
      new LabelBuilder()
        .setLabel("Avatar")
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("avatar")
            .setMaxValues(1)
            .setRequired(false)
        ),
      new LabelBuilder()
        .setLabel("Banner")
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("banner")
            .setMaxValues(1)
            .setRequired(false)
        )
    );
}

async function applyCustomBotChanges({ guild, moderator, avatarAttachment, bannerAttachment, apodo, biografia }) {
  const me = await fetchBotMember(guild, { force: true });
  if (apodo !== undefined && !me?.permissions?.has(PermissionFlagsBits.ChangeNickname)) {
    return { error: "Necesito el permiso **Cambiar apodo** (`ChangeNickname`) para modificar mi apodo en este servidor" };
  }

  const [avatarRes, bannerRes] = await Promise.all([
    fetchBotImageBuffer(avatarAttachment, "avatar"),
    fetchBotImageBuffer(bannerAttachment, "banner"),
  ]);
  if (avatarRes.error) return { error: avatarRes.error };
  if (bannerRes.error) return { error: bannerRes.error };

  const payload = {};
  const changes = [];
  if (avatarRes.buffer) {
    payload.avatar = { buffer: avatarRes.buffer, mimeType: avatarRes.mimeType };
    changes.push("Avatar");
  }
  if (bannerRes.buffer) {
    payload.banner = { buffer: bannerRes.buffer, mimeType: bannerRes.mimeType };
    changes.push("Banner");
  }
  if (apodo !== undefined) {
    payload.nick = apodo;
    changes.push("Apodo");
  }
  if (biografia !== undefined) {
    payload.bio = biografia;
    changes.push("Biografía");
  }

  if (!changes.length) {
    return { error: "Debes proporcionar al menos una opción para actualizar" };
  }

  const { updatedMe, bio } = await patchGuildBotProfile(
    guild,
    payload,
    `Perfil personalizado por ${moderator.tag}`
  );
  const card = buildCustomBotCard({
    updatedMe,
    bioValue: biografia !== undefined ? biografia : bio,
    moderator,
  });

  await logAction(guild, {
    title: "Perfil del bot actualizado",
    color: GREEN,
    fields: [
      { name: "Moderador", value: moderator.tag, inline: true },
      { name: "Cambios", value: changes.join(", "), inline: true },
      ...(apodo !== undefined ? [{ name: "Apodo", value: apodo || "Por defecto", inline: true }] : []),
      ...(biografia !== undefined ? [{ name: "Biografía", value: V2Text.clip(biografia, 190), inline: false }] : []),
    ],
  });

  return { card };
}

function buildCustomBotResetModal(modalId) {
  return new ModalBuilder()
    .setCustomId(modalId)
    .setTitle("Restablecer perfil del bot")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("¿Qué campos deseas restablecer?")
        .setCheckboxGroupComponent(
          new CheckboxGroupBuilder()
            .setCustomId("scopes")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(4)
            .addOptions(
              new CheckboxGroupOptionBuilder().setLabel("Avatar del servidor").setValue("avatar").setDefault(true),
              new CheckboxGroupOptionBuilder().setLabel("Banner del servidor").setValue("banner").setDefault(true),
              new CheckboxGroupOptionBuilder().setLabel("Biografía del servidor").setValue("biografia").setDefault(true),
              new CheckboxGroupOptionBuilder().setLabel("Apodo del servidor").setValue("apodo").setDefault(true)
            )
        )
    );
}

async function applyCustomBotResetScopes({ guild, moderator, scopes = ["avatar", "banner", "biografia", "apodo"] }) {
  const uniqueScopes = [...new Set((scopes ?? []).filter((s) => ["avatar", "banner", "biografia", "apodo"].includes(s)))];
  if (!uniqueScopes.length) {
    return { error: "Elige al menos un campo para restablecer." };
  }

  const me = await fetchBotMember(guild, { force: true });
  const hasChangeNick = Boolean(me?.permissions?.has(PermissionFlagsBits.ChangeNickname));
  const isAll = uniqueScopes.length === 4;

  if (!isAll && uniqueScopes.includes("apodo") && !hasChangeNick) {
    return { error: "Necesito el permiso **Cambiar apodo** (`ChangeNickname`) para restablecer mi apodo en este servidor" };
  }
  if (isAll && me?.nickname && !hasChangeNick) {
    return { error: "Necesito el permiso **Cambiar apodo** (`ChangeNickname`) para restablecer mi apodo en este servidor" };
  }

  const payload = {};
  if (uniqueScopes.includes("avatar")) payload.avatar = null;
  if (uniqueScopes.includes("banner")) payload.banner = null;
  if (uniqueScopes.includes("biografia")) payload.bio = null;
  if (uniqueScopes.includes("apodo") && hasChangeNick) payload.nick = null;

  const scopeLabel = isAll
    ? RESET_SCOPE_LABELS.todo
    : uniqueScopes.map((s) => RESET_SCOPE_LABELS[s] ?? s).join(", ");

  const { updatedMe, bio } = await patchGuildBotProfile(
    guild,
    payload,
    `Perfil restablecido (${isAll ? "todo" : uniqueScopes.join(",")}) por ${moderator.tag}`
  );
  const card = buildCustomBotCard({
    updatedMe,
    bioValue: uniqueScopes.includes("biografia") ? null : bio,
    moderator,
  });

  await logAction(guild, {
    title: "Perfil del bot restablecido",
    color: GREEN,
    fields: [
      { name: "Moderador", value: moderator.tag, inline: true },
      { name: "Campo", value: scopeLabel, inline: true },
    ],
  });

  return { card };
}

async function applyCustomBotReset({ guild, moderator, rawScope = null }) {
  const normalized = rawScope ? RESET_SCOPE_ALIASES[String(rawScope).trim().toLowerCase()] : "todo";
  if (!normalized) {
    return { error: "Campo inválido. Usa: `todo`, `avatar`, `banner`, `biografia` o `apodo`" };
  }
  const scopes = normalized === "todo" ? ["avatar", "banner", "biografia", "apodo"] : [normalized];
  return applyCustomBotResetScopes({ guild, moderator, scopes });
}

async function sendModalErrorReply(submitted, isPrefix, message) {
  if (isPrefix) {
    await submitted.editReply({ content: message }).catch(() => {});
  } else {
    await submitted.deleteReply().catch(() => {});
    await submitted.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function handleCustomBotModalAction({ submitted, ctx, interaction, activeView, runAction, logLabel, fallbackError }) {
  const isPrefix = Boolean(ctx.message);
  await submitted.deferReply(isPrefix ? { flags: MessageFlags.Ephemeral } : undefined);

  try {
    const res = await runAction();
    if (res.error) {
      await sendModalErrorReply(submitted, isPrefix, res.error);
      return false;
    }

    await activeView.message?.delete?.().catch(() => {});
    activeView.stop("deleted");

    const v2Payload = res.card.toPayload();
    if (isPrefix) {
      await submitted.deleteReply().catch(() => {});
      await ctx.message
        .reply({ ...v2Payload, allowedMentions: { repliedUser: false } })
        .catch(() => (interaction.channel ?? ctx.channel)?.send?.(v2Payload));
    } else {
      await submitted.editReply(v2Payload).catch(() => {});
    }
  } catch (err) {
    log.error(logLabel, { err: err?.message ?? String(err) });
    const friendly = mapCustomBotApiError(err) ?? fallbackError;
    await sendModalErrorReply(submitted, isPrefix, friendly);
  }
  return false;
}

async function sendCustomBotPanel(ctx) {
  const guild = ctx.guild;
  const author = ctx.user;
  const me = await fetchBotMember(guild, { force: true });

  const view = new V2View({
    authorId: author.id,
    timeout: 2 * 60 * 1000,
    thirdPartyMode: "reject",
    thirdPartyMessage: "No es tu menú. Abre el tuyo con `/server custombot`.",
    onEnd: "static",
    state: { me },
    render: ({ state, view: activeView, isEnded }) => {
      const controls = isEnded
        ? null
        : [
            { customId: activeView.id("editar"), label: "Editar perfil", style: "danger" },
            { customId: activeView.id("reset"), label: "Restablecer...", style: "secondary" },
          ];
      return buildCustomBotStatusCard(state.me, guild, { isEnded, controls });
    },
    renderStatic: ({ state }) => buildCustomBotStatusCard(state.me, guild, { isEnded: true }),
    actions: {
      editar: async ({ interaction, view: activeView }) => {
        const modalId = activeView.id("modal", Date.now().toString(36));
        await interaction.showModal(buildCustomBotModal(modalId));

        const submitted = await interaction
          .awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: (i) => i.customId === modalId && i.user.id === author.id,
          })
          .catch(() => null);
        if (!submitted) return false;

        const rawNick = submitted.fields.getTextInputValue("apodo")?.trim?.() ?? "";
        const rawBio = submitted.fields.getTextInputValue("biografia")?.trim?.() ?? "";
        const avatarAttachment = submitted.fields.getUploadedFiles("avatar")?.first?.() ?? null;
        const bannerAttachment = submitted.fields.getUploadedFiles("banner")?.first?.() ?? null;

        if (!rawNick && !rawBio && !avatarAttachment && !bannerAttachment) {
          await submitted.reply({ content: "No modificaste ningún campo.", flags: MessageFlags.Ephemeral }).catch(() => {});
          return false;
        }

        return handleCustomBotModalAction({
          submitted,
          ctx,
          interaction,
          activeView,
          runAction: () =>
            applyCustomBotChanges({
              guild,
              moderator: author,
              avatarAttachment,
              bannerAttachment,
              apodo: rawNick || undefined,
              biografia: rawBio || undefined,
            }),
          logLabel: "Error en modal custombot",
          fallbackError: "No se pudo actualizar el perfil del bot",
        });
      },
      reset: async ({ interaction, view: activeView }) => {
        const modalId = activeView.id("resetmodal", Date.now().toString(36));
        await interaction.showModal(buildCustomBotResetModal(modalId));

        const submitted = await interaction
          .awaitModalSubmit({
            time: 3 * 60_000,
            filter: (i) => i.customId === modalId && i.user.id === author.id,
          })
          .catch(() => null);
        if (!submitted) return false;

        const scopes = submitted.fields.getCheckboxGroup("scopes") ?? [];
        return handleCustomBotModalAction({
          submitted,
          ctx,
          interaction,
          activeView,
          runAction: () => applyCustomBotResetScopes({ guild, moderator: author, scopes }),
          logLabel: "Error en boton customreset",
          fallbackError: "No se pudo restablecer el perfil del bot",
        });
      },
    },
  });

  await view.send(ctx);
}

function getServerViewBuilder(guild, selected, { historyButtonId = null } = {}) {
  if (selected === "logo") {
    const iconURL = guild.iconURL({ size: 4096, extension: "png" });
    if (!iconURL) return { error: "Este servidor no tiene logo configurado." };
    return {
      targetType: "server_logo",
      imageUrl: iconURL,
      historyTitle: `Historial de logo (${guild.name})`,
      builder: buildImageCard({ title: `Logo de ${guild.name}`, imageUrl: iconURL, color: RED, historyButtonId }),
    };
  }
  if (selected === "banner") {
    const bannerURL = guild.bannerURL({ size: 4096, extension: "png" });
    if (!bannerURL) return { error: "Este servidor no tiene banner" };
    return {
      targetType: "server_banner",
      imageUrl: bannerURL,
      historyTitle: `Historial de banner (${guild.name})`,
      builder: buildImageCard({ title: `Banner de ${guild.name}`, imageUrl: bannerURL, color: RED, historyButtonId }),
    };
  }
  if (selected === "emojis") {
    const emojis = guild.emojis.cache.map((e) => e.toString());
    if (!emojis.length) return { error: "Este servidor no tiene emojis" };
    const desc = emojis.reduce((acc, cur) => (acc.length + cur.length + 1 > 3750 ? acc : acc + (acc ? " " : "") + cur), "");
    return {
      builder: new ComponentsV2Builder({ color: RED })
        .addText(V2Text.heading(`Emojis de ${V2Text.clip(guild.name, 100)} (${emojis.length})`, 3))
        .addSeparator("small")
        .addText(desc),
    };
  }
  return null;
}

function getSortedServerRoles(guild, memberCounts = null) {
  if (memberCounts && typeof memberCounts.get === "function") {
    return Array.from(
      guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .values()
    ).map((r) => {
      const cnt = memberCounts.get(r.id);
      return cnt !== undefined ? `<@&${r.id}> · \`${cnt}\`` : `<@&${r.id}>`;
    });
  }
  return formatSortedRoles(guild.roles.cache, guild.id);
}

function buildServerRolesCard(guild, totalRoles, pageItems, pageIndex, totalPages, { controls = null } = {}) {
  const start = pageIndex * PAGE_SIZE;
  const builder = new ComponentsV2Builder({ color: RED })
    .addSection(
      [V2Text.heading(`Roles de ${guild.name} (${pageIndex + 1}/${totalPages})`, 3, 200)],
      { thumbnail: guild.iconURL({ size: 256, extension: "png" }), fallbackToText: true }
    )
    .addSeparator("small")
    .addText(V2Text.clip(pageItems.map((r, i) => `${start + i + 1}. ${r}`).join("\n"), 3600))
    .addText(V2Text.subtext(`${totalRoles} roles en total`, 200));

  if (controls?.length) builder.addSpacer("small").addButtonsRow(controls);
  return builder;
}

function buildServerInfoCard(guild, owner) {
  const createdTs = Math.floor(guild.createdTimestamp / 1000);
  const roleCount = guild.roles.cache.filter((r) => r.id !== guild.id).size;
  const visibleChannelCount = guild.channels.cache.filter((c) => !isObfuscatedChannel(c)).size;
  const soundCount = guild.soundboardSounds?.cache?.size ?? 0;

  const generalRows = [
    ["ID", V2Text.code(guild.id)],
    ["Dueño", owner ? owner.user.username : "No disponible"],
    ["Creación", `<t:${createdTs}:F> (<t:${createdTs}:R>)`],
    guild.vanityURLCode ? ["Tag", V2Text.code(guild.vanityURLCode)] : null,
  ];
  const statsRows = [
    ["Miembros", V2Text.code(guild.memberCount)],
    ["Canales", V2Text.code(visibleChannelCount)],
    ["Roles", V2Text.code(roleCount)],
    ["Emojis", V2Text.code(guild.emojis.cache.size)],
    soundCount > 0 ? ["Soundboard", V2Text.code(soundCount)] : null,
    ["Boost", V2Text.code(`${guild.premiumSubscriptionCount} (Nivel ${guild.premiumTier})`)],
  ].filter(Boolean);

  const now = Date.now();
  const invUntil = guild.incidentsData?.invitesDisabledUntil;
  const dmsUntil = guild.incidentsData?.dmsDisabledUntil;
  const activeIncidents = [];
  if (invUntil && new Date(invUntil).getTime() > now) {
    activeIncidents.push(`Invitaciones <t:${Math.floor(new Date(invUntil).getTime() / 1000)}:R>`);
  }
  if (dmsUntil && new Date(dmsUntil).getTime() > now) {
    activeIncidents.push(`DMs <t:${Math.floor(new Date(dmsUntil).getTime() / 1000)}:R>`);
  }

  const securityRows = [
    ["Verificación", V2Text.code(VERIFICATION_LEVELS[guild.verificationLevel] ?? guild.verificationLevel)],
    activeIncidents.length ? ["Pausas activas", activeIncidents.join(" · ")] : null,
  ].filter(Boolean);

  return new ComponentsV2Builder({ color: RED })
    .addSection(
      [V2Text.heading(guild.name, 3, 100), V2Text.sectionBlock("General", generalRows)],
      { thumbnail: guild.iconURL({ size: 1024, extension: "png" }) }
    )
    .addSectionBlock("Estadísticas", statsRows, { separator: true })
    .addSectionBlock("Seguridad", securityRows, { separator: true });
}

function createServerViewCommand(name, description) {
  return {
    data: new CommandBuilder({ name, description }),
    async code(ctx) {
      await ctx.defer();
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const initial = getServerViewBuilder(guild, name);
        if (initial.error) return ctx.send(initial.error);

        if (!initial.targetType) {
          return ctx.send(initial.builder);
        }

        await recordImageIfNew(initial.targetType, guild.id, initial.imageUrl);
        const invoker = ctx.user ?? ctx.member?.user;

        const imgView = new V2View({
          authorId: invoker?.id,
          timeout: 60_000,
          thirdPartyMode: "ephemeral-view",
          onEnd: "static",
          render: ({ view, isEnded }) => {
            const viewData = getServerViewBuilder(guild, name, { historyButtonId: isEnded ? null : view.id("history") });
            return viewData?.builder ?? ComponentsV2Builder.card({ description: viewData?.error ?? "No disponible", color: RED });
          },
          renderStatic: () => {
            const viewData = getServerViewBuilder(guild, name);
            return viewData?.builder ?? ComponentsV2Builder.card({ description: viewData?.error ?? "No disponible", color: RED });
          },
          actions: {
            history: async ({ interaction }) => {
              await replyWithImageHistory(interaction, {
                targetType: initial.targetType,
                targetId: guild.id,
                title: initial.historyTitle,
                color: RED,
              });
              return false;
            },
          },
        });

        await imgView.send(ctx);
      } catch (err) {
        log.error(`Error en server ${name}`, { err: err?.message ?? String(err) });
        return handleCommandError(ctx, err);
      }
    },
  };
}

const data = {
  data: new GroupBuilder({
    name: "server",
    description: "Información, recursos y configuración del servidor",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({
        name: "info",
        description: "Información general y estadísticas del servidor",
      }),
      async code(ctx) {
        await ctx.defer();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const [owner, memberCounts] = await Promise.all([
            guild.fetchOwner().catch(() => null),
            guild.roles.fetchMemberCounts().catch(() => null),
          ]);
          const authorId = ctx.user?.id;

          const baseOptions = [
            { label: "Logo", value: "logo", description: "Logo del servidor" },
            ...(guild.banner ? [{ label: "Banner", value: "banner", description: "Banner del servidor" }] : []),
            { label: "Roles", value: "roles", description: "Roles del servidor" },
            { label: "Emojis", value: "emojis", description: "Emojis del servidor" },
          ];
          const allOptions = [{ label: "Info", value: "info", description: "Información del servidor" }, ...baseOptions];

          const roles = getSortedServerRoles(guild, memberCounts);
          const totalRolePages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));

          const renderView = ({ state, view, isEnded }) => {
            let builder;
            if (state.tab === "roles") {
              const sliced = slicePage(roles, state.pageIndex, PAGE_SIZE);
              const controls = !isEnded && totalRolePages > 1
                ? [
                    { label: "◀", customId: view.id("page", "prev"), style: "secondary", disabled: sliced.pageIndex <= 0 },
                    { label: "▶", customId: view.id("page", "next"), style: "secondary", disabled: sliced.pageIndex >= totalRolePages - 1 },
                  ]
                : null;
              builder = buildServerRolesCard(guild, roles.length, sliced.items, sliced.pageIndex, totalRolePages, { controls });
            } else if (state.tab !== "info") {
              const viewData = getServerViewBuilder(guild, state.tab, {
                historyButtonId: !isEnded && (state.tab === "logo" || state.tab === "banner") ? view.id("history") : null,
              });
              builder = viewData?.builder ?? buildServerInfoCard(guild, owner);
            } else {
              builder = buildServerInfoCard(guild, owner);
            }

            if (!isEnded) {
              builder.addSpacer("small").addSelectMenu({
                customId: view.id("select"),
                placeholder: "Navegar...",
                options: state.tab === "info" ? baseOptions : allOptions,
              });
            }

            return builder;
          };

          const serverView = new V2View({
            authorId,
            timeout: 5 * 60 * 1000,
            thirdPartyMode: "ephemeral-view",
            onEnd: "static",
            state: { tab: "info", pageIndex: 0 },
            render: renderView,
            renderStatic: (args) => renderView({ ...args, isEnded: true }),
            actions: {
              select: async ({ values, interaction, setState }) => {
                const selected = values[0];
                if (!selected) return false;

                if (selected === "roles") {
                  if (!roles.length) {
                    await interaction.reply({ content: "Este servidor no tiene roles", flags: MessageFlags.Ephemeral }).catch(() => {});
                    return false;
                  }
                  setState({ tab: "roles", pageIndex: 0 });
                  return;
                }

                if (selected !== "info") {
                  const view = getServerViewBuilder(guild, selected);
                  if (view?.error) {
                    await interaction.reply({ content: view.error, flags: MessageFlags.Ephemeral }).catch(() => {});
                    return false;
                  }
                  if (view?.targetType) {
                    await recordImageIfNew(view.targetType, guild.id, view.imageUrl);
                  }
                }

                setState({ tab: selected, pageIndex: 0 });
              },
              history: async ({ interaction, state }) => {
                const view = getServerViewBuilder(guild, state.tab);
                if (!view?.targetType) return false;
                await replyWithImageHistory(interaction, {
                  targetType: view.targetType,
                  targetId: guild.id,
                  title: view.historyTitle,
                  color: RED,
                });
                return false;
              },
              page: ({ parts, state, setState }) => {
                const delta = parts[0] === "prev" ? -1 : 1;
                const next = Math.max(0, Math.min(totalRolePages - 1, state.pageIndex + delta));
                setState({ pageIndex: next });
              },
            },
          });

          await serverView.send(ctx);
        } catch (err) {
          log.error("Error en server info", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand(createServerViewCommand("logo", "Logo del servidor en alta resolución"))
    .addCommand(createServerViewCommand("banner", "Banner del servidor en alta resolución"))
    .addCommand(createServerViewCommand("emojis", "Lista de emojis del servidor"))
    .addCommand({
      data: new CommandBuilder({
        name: "roles",
        description: "Lista de roles del servidor",
      }),
      async code(ctx) {
        await ctx.defer();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const memberCounts = await guild.roles.fetchMemberCounts().catch(() => null);
          const roles = getSortedServerRoles(guild, memberCounts);
          if (!roles.length) return ctx.send("No hay roles en este servidor aparte de `@everyone`.");

          const authorId = ctx.user?.id;
          const paginator = createListPaginator({
            items: roles,
            perPage: PAGE_SIZE,
            ownerId: authorId,
            render: ({ items: pageItems, pageIndex, totalPages, controls }) =>
              buildServerRolesCard(guild, roles.length, pageItems, pageIndex, totalPages, { controls }),
          });

          await paginator.send(ctx);
        } catch (err) {
          log.error("Error en server roles", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "custombot",
        description: "Personaliza avatar, banner, apodo o bio del bot en el servidor",
      }),
      params: new ParamsBuilder()
        .addAttachment({ name: "avatar", description: "Nuevo avatar para el bot en este servidor", required: false })
        .addAttachment({ name: "banner", description: "Nuevo banner para el bot en este servidor", required: false })
        .addString({ name: "apodo", description: "Nuevo apodo del bot (máx 32 caracteres)", required: false, max_length: 32 })
        .addString({ name: "biografia", description: "Nueva biografía del bot (máx 190 caracteres)", required: false, max_length: 190 }),
      plugins: [Plugins.hasPerms("ManageGuild")],

      async code(ctx) {
        await ctx.defer();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const avatarAttachment = ctx.get("avatar") ?? null;
          const bannerAttachment = ctx.get("banner") ?? null;
          const rawApodo = ctx.get("apodo");
          const rawBio = ctx.get("biografia");
          const apodo = rawApodo !== null && rawApodo !== undefined ? String(rawApodo).trim() : undefined;
          const biografia = rawBio !== null && rawBio !== undefined ? String(rawBio).trim() : undefined;

          if (!avatarAttachment && !bannerAttachment && !apodo && !biografia) {
            return sendCustomBotPanel(ctx);
          }

          const res = await applyCustomBotChanges({
            guild,
            moderator: ctx.user,
            avatarAttachment,
            bannerAttachment,
            apodo: apodo || undefined,
            biografia: biografia || undefined,
          });
          if (res.error) return ctx.ephemeral(res.error);

          await ctx.send(res.card);
        } catch (err) {
          const friendly = mapCustomBotApiError(err);
          if (friendly) return ctx.ephemeral(friendly);
          log.error("Error en server custombot", { err: err?.message ?? String(err) });
          return failWith(ctx, err, "No se pudo actualizar el perfil del bot");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "customreset",
        description: "Restaura el perfil original del bot en el servidor",
      }),
      params: new ParamsBuilder().addString({
        name: "campo",
        description: "Campo a restaurar (por defecto todos)",
        required: false,
        choices: [
          { name: "Todo", value: "todo" },
          { name: "Avatar", value: "avatar" },
          { name: "Banner", value: "banner" },
          { name: "Biografía", value: "biografia" },
          { name: "Apodo", value: "apodo" },
        ],
      }),
      plugins: [Plugins.hasPerms("ManageGuild")],

      async code(ctx) {
        await ctx.defer();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const res = await applyCustomBotReset({
            guild,
            moderator: ctx.user,
            rawScope: ctx.get("campo"),
          });
          if (res.error) return ctx.ephemeral(res.error);

          await ctx.send(res.card);
        } catch (err) {
          const friendly = mapCustomBotApiError(err);
          if (friendly) return ctx.ephemeral(friendly);
          log.error("Error en server customreset", { err: err?.message ?? String(err) });
          return failWith(ctx, err, "No se pudo restablecer el perfil del bot");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "setup",
        description: "Panel interactivo de configuración del servidor",
      }),
      plugins: [Plugins.hasPerms("ManageGuild")],

      async code(ctx) {
        await ctx.defer();
        try {
          if (!ctx.guild) return noGuildReply(ctx);
          await sendServerSetupPanel(ctx, { onOpenCustomBot: sendCustomBotPanel });
        } catch (err) {
          log.error("Error en server setup", { err: err?.message ?? String(err) });
          return failWith(ctx, err, "No se pudo abrir el panel de configuración");
        }
      },
    }),
};

module.exports = { data };
