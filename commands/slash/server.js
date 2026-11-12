const {
  EmbedBuilder,
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
} = require("../../src/runtime");
const { RED, GREEN } = require("../../src/config");
const { logAction } = require("../../src/guild");
const { fetchPublic, readBodyLimited } = require("../../src/security");

const PAGE_SIZE = 15;
const MAX_BOT_IMAGE_BYTES = 8 * 1024 * 1024;
const VALID_BOT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
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
const log = new Logger("CMD_SERVER", process.env.LOG_LEVEL);

async function fetchBotImageBuffer(attachment, label) {
  if (!attachment) return { buffer: undefined };
  if (attachment.contentType && !VALID_BOT_IMAGE_TYPES.some((t) => attachment.contentType.toLowerCase().startsWith(t))) {
    return { error: `El archivo de **${label}** debe ser una imagen válida (jpg, png, gif, webp)` };
  }
  if (attachment.size > MAX_BOT_IMAGE_BYTES) {
    return { error: `La imagen de **${label}** no puede superar los 8MB` };
  }

  const res = await fetchPublic(attachment.url, {}, 15_000);
  if (!res.ok) {
    throw new Error(`No se pudo descargar la imagen de ${label} (${res.status})`);
  }

  const resType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (resType && !VALID_BOT_IMAGE_TYPES.some((t) => resType.startsWith(t))) {
    return { error: `El archivo de **${label}** debe ser una imagen válida (jpg, png, gif, webp)` };
  }

  const body = await readBodyLimited(res, MAX_BOT_IMAGE_BYTES);
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

async function fetchMeSafely(guild) {
  return guild.members.fetchMe({ force: true }).catch(() => guild.members.me ?? null);
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
    const updatedMe = await fetchMeSafely(guild);
    return { updatedMe, bio: rawMember?.bio ?? undefined };
  }

  const editPayload = { ...payload };
  if (Buffer.isBuffer(editPayload.avatar?.buffer)) editPayload.avatar = editPayload.avatar.buffer;
  if (Buffer.isBuffer(editPayload.banner?.buffer)) editPayload.banner = editPayload.banner.buffer;
  await guild.members.editMe({ ...editPayload, reason });
  const updatedMe = await fetchMeSafely(guild);
  return { updatedMe, bio: undefined };
}

function buildCustomBotEmbed({ updatedMe, bioValue = null, moderator }) {
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

  const embed = new EmbedBuilder()
    .setTitle("Cambios aplicados")
    .setColor(GREEN)
    .setDescription(
      [
        `Avatar: ${avatarLabel}`,
        `Apodo: ${nickLabel}`,
        `Banner: ${bannerLabel}`,
        `Biografia: ${bioLabel}`,
      ].join("\n")
    );

  if (displayAvatar) embed.setThumbnail(displayAvatar);
  if (displayBanner) embed.setImage(displayBanner);
  if (moderator) {
    embed.setFooter({
      text: moderator.globalName || moderator.username || moderator.tag,
      iconURL: moderator.displayAvatarURL({ size: 128 }),
    });
  }

  return embed;
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
  const me = await fetchMeSafely(guild);
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
  const embed = buildCustomBotEmbed({
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

  return { embed };
}

async function applyCustomBotReset({ guild, moderator, rawScope = null }) {
  const normalized = rawScope ? RESET_SCOPE_ALIASES[String(rawScope).trim().toLowerCase()] : "todo";
  if (!normalized) {
    return { error: "Campo inválido. Usa: `todo`, `avatar`, `banner`, `biografia` o `apodo`" };
  }

  const me = await fetchMeSafely(guild);
  const hasChangeNick = Boolean(me?.permissions?.has(PermissionFlagsBits.ChangeNickname));

  if (normalized === "apodo" && !hasChangeNick) {
    return { error: "Necesito el permiso **Cambiar apodo** (`ChangeNickname`) para restablecer mi apodo en este servidor" };
  }
  if (normalized === "todo" && me?.nickname && !hasChangeNick) {
    return { error: "Necesito el permiso **Cambiar apodo** (`ChangeNickname`) para restablecer mi apodo en este servidor" };
  }

  const payload = {};
  if (normalized === "todo") {
    payload.avatar = null;
    payload.banner = null;
    payload.bio = null;
    if (hasChangeNick) payload.nick = null;
  } else if (normalized === "avatar") {
    payload.avatar = null;
  } else if (normalized === "banner") {
    payload.banner = null;
  } else if (normalized === "biografia") {
    payload.bio = null;
  } else if (normalized === "apodo") {
    payload.nick = null;
  }

  const { updatedMe, bio } = await patchGuildBotProfile(
    guild,
    payload,
    `Perfil restablecido (${normalized}) por ${moderator.tag}`
  );
  const label = RESET_SCOPE_LABELS[normalized];
  const embed = buildCustomBotEmbed({
    updatedMe,
    bioValue: normalized === "todo" || normalized === "biografia" ? null : bio,
    moderator,
  });

  await logAction(guild, {
    title: "Perfil del bot restablecido",
    color: GREEN,
    fields: [
      { name: "Moderador", value: moderator.tag, inline: true },
      { name: "Campo", value: label, inline: true },
    ],
  });

  return { embed };
}

async function sendCustomBotPanel(ctx) {
  const guild = ctx.guild;
  const author = ctx.user;
  const me = await fetchMeSafely(guild);

  const view = new V2View({
    authorId: author.id,
    timeout: 2 * 60 * 1000,
    thirdPartyMode: "reject",
    thirdPartyMessage: "No puedes usar este menú",
    onEnd: "static",
    state: { me },
    render: ({ state, view: activeView, isEnded }) => {
      const controls = isEnded
        ? null
        : [
            { customId: activeView.id("editar"), label: "Editar perfil", style: "primary" },
            { customId: activeView.id("reset"), label: "Restablecer todo", style: "danger" },
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
          await submitted.reply({ content: "No cambió nada", flags: MessageFlags.Ephemeral }).catch(() => {});
          return false;
        }

        await submitted.deferReply();

        try {
          const res = await applyCustomBotChanges({
            guild,
            moderator: author,
            avatarAttachment,
            bannerAttachment,
            apodo: rawNick || undefined,
            biografia: rawBio || undefined,
          });
          if (res.error) {
            await submitted.deleteReply().catch(() => {});
            await submitted.followUp({ content: res.error, flags: MessageFlags.Ephemeral }).catch(() => {});
            return false;
          }

          await activeView.message?.delete?.().catch(() => {});
          activeView.stop("deleted");
          await submitted.editReply({ embeds: [res.embed] }).catch(() => {});
        } catch (err) {
          log.error("Error en modal custombot", { err: err?.message ?? String(err) });
          const friendly = mapCustomBotApiError(err) ?? "No se pudo actualizar el perfil del bot";
          await submitted.deleteReply().catch(() => {});
          await submitted.followUp({ content: friendly, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return false;
      },
      reset: async ({ interaction, view: activeView }) => {
        await interaction.deferUpdate();
        try {
          const res = await applyCustomBotReset({ guild, moderator: author, rawScope: "todo" });
          if (res.error) {
            await interaction.followUp({ content: res.error, flags: MessageFlags.Ephemeral }).catch(() => {});
            return false;
          }
          await activeView.message?.delete?.().catch(() => {});
          activeView.stop("deleted");
          const ch = interaction.channel ?? ctx.channel;
          if (ch?.send) await ch.send({ embeds: [res.embed] }).catch(() => {});
        } catch (err) {
          log.error("Error en boton customreset", { err: err?.message ?? String(err) });
          const friendly = mapCustomBotApiError(err) ?? "No se pudo restablecer el perfil del bot";
          await interaction.followUp({ content: friendly, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return false;
      },
    },
  });

  await view.send(ctx);
}

function buildServerImageCard(guild, title, imageUrl) {
  return ComponentsV2Builder.imageView({
    title,
    image: imageUrl,
    color: RED,
    links: [{ label: "Abrir imagen", url: imageUrl }],
  });
}

function getServerViewBuilder(guild, selected) {
  if (selected === "logo") {
    if (!guild.iconURL()) return { error: "Este servidor no tiene logo" };
    return { builder: buildServerImageCard(guild, `Logo de ${guild.name}`, guild.iconURL({ size: 4096, extension: "png" })) };
  }
  if (selected === "banner") {
    const bannerURL = guild.bannerURL({ size: 4096, extension: "png" });
    if (!bannerURL) return { error: "Este servidor no tiene banner" };
    return { builder: buildServerImageCard(guild, `Banner de ${guild.name}`, bannerURL) };
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

function getSortedServerRoles(guild) {
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

  const generalRows = [
    ["ID", V2Text.code(guild.id)],
    ["Dueño", owner ? owner.user.username : "No disponible"],
    ["Creación", `<t:${createdTs}:F> (<t:${createdTs}:R>)`],
    guild.vanityURLCode ? ["Tag", V2Text.code(guild.vanityURLCode)] : null,
  ];
  const statsRows = [
    ["Miembros", V2Text.code(guild.memberCount)],
    ["Canales", V2Text.code(guild.channels.cache.size)],
    ["Roles", V2Text.code(roleCount)],
    ["Emojis", V2Text.code(guild.emojis.cache.size)],
    ["Boost", V2Text.code(`${guild.premiumSubscriptionCount} (Nivel ${guild.premiumTier})`)],
  ];
  const securityRows = [
    ["Verificación", V2Text.code(VERIFICATION_LEVELS[guild.verificationLevel] ?? guild.verificationLevel)],
  ];

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

        const view = getServerViewBuilder(guild, name);
        if (view.error) return ctx.send(view.error);

        await ctx.send(view.builder);
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
    description: "Comandos de información del servidor",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({
        name: "info",
        description: "Muestra información del servidor",
      }),
      async code(ctx) {
        await ctx.defer();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const owner = await guild.fetchOwner().catch(() => null);
          const authorId = ctx.user?.id;

          const baseOptions = [
            { label: "Logo", value: "logo", description: "Logo del servidor" },
            ...(guild.banner ? [{ label: "Banner", value: "banner", description: "Banner del servidor" }] : []),
            { label: "Roles", value: "roles", description: "Roles del servidor" },
            { label: "Emojis", value: "emojis", description: "Emojis del servidor" },
          ];
          const allOptions = [{ label: "Info", value: "info", description: "Información del servidor" }, ...baseOptions];

          const roles = getSortedServerRoles(guild);
          const totalRolePages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));

          const renderView = ({ state, view, isEnded }) => {
            let builder;
            if (state.tab === "roles") {
              const safePage = Math.max(0, Math.min(totalRolePages - 1, state.pageIndex));
              const pageItems = roles.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
              const controls = !isEnded && totalRolePages > 1
                ? [
                    { label: "◀", customId: view.id("page", "prev"), style: "secondary", disabled: safePage <= 0 },
                    { label: "▶", customId: view.id("page", "next"), style: "secondary", disabled: safePage >= totalRolePages - 1 },
                  ]
                : null;
              builder = buildServerRolesCard(guild, roles.length, pageItems, safePage, totalRolePages, { controls });
            } else if (state.tab !== "info") {
              builder = getServerViewBuilder(guild, state.tab).builder;
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
                }

                setState({ tab: selected, pageIndex: 0 });
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
    .addCommand(createServerViewCommand("logo", "Muestra el logo del servidor"))
    .addCommand(createServerViewCommand("banner", "Muestra el banner del servidor"))
    .addCommand(createServerViewCommand("emojis", "Muestra todos los emojis del servidor"))
    .addCommand({
      data: new CommandBuilder({
        name: "roles",
        description: "Lista los roles del servidor",
      }),
      async code(ctx) {
        await ctx.defer();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const roles = getSortedServerRoles(guild);
          if (!roles.length) return ctx.send("No hay roles");

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
        description: "Personaliza el avatar, banner, apodo o biografía del bot en este servidor",
      }),
      params: new ParamsBuilder()
        .addAttachment({ name: "avatar", description: "Nuevo avatar del bot para este servidor", required: false })
        .addAttachment({ name: "banner", description: "Nuevo banner del bot para este servidor", required: false })
        .addString({ name: "apodo", description: "Nuevo apodo del bot en el servidor (máx. 32)", required: false, max_length: 32 })
        .addString({ name: "biografia", description: "Nueva biografía del bot en el servidor (máx. 190)", required: false, max_length: 190 }),
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

          await ctx.send({ embeds: [res.embed] });
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
        description: "Restablece el perfil personalizado del bot en este servidor",
      }),
      params: new ParamsBuilder().addString({
        name: "campo",
        description: "Campo a restablecer (por defecto todos)",
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

          await ctx.send({ embeds: [res.embed] });
        } catch (err) {
          const friendly = mapCustomBotApiError(err);
          if (friendly) return ctx.ephemeral(friendly);
          log.error("Error en server customreset", { err: err?.message ?? String(err) });
          return failWith(ctx, err, "No se pudo restablecer el perfil del bot");
        }
      },
    }),
};

module.exports = { data };
