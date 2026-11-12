const { CommandBuilder, GroupBuilder, ParamsBuilder } = require("gralonium");
const {
  ActionRowBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const {
  Logger,
  clampPage,
  noGuildReply,
  uniqueId,
  formatPermissionName: formatPermName,
  paginateArray,
  handleCommandError,
} = require("../../src/runtime");
const { resolveMemberFlexible: resolveMember } = require("../../src/adapter");
const { RED, DARK } = require("../../src/config");
const {
  createContainer,
  addHeaderSection,
  addSeparator,
  addTextBlock,
  clipV2Text,
  buildSimpleContainer,
  buildImageViewContainer,
  buildPaginatedListContainer,
  buildV2Payload,
} = require("../../src/v2");

const log = new Logger("CMD_USER", process.env.LOG_LEVEL);

const BADGE_NAMES = {
  Staff: "Personal de Discord",
  Partner: "Servidor Socio",
  Hypesquad: "Eventos HypeSquad",
  BugHunterLevel1: "Cazador de Errores",
  BugHunterLevel2: "Cazador de Errores (Oro)",
  HypeSquadOnlineHouse1: "HypeSquad Bravery",
  HypeSquadOnlineHouse2: "HypeSquad Brilliance",
  HypeSquadOnlineHouse3: "HypeSquad Balance",
  PremiumEarlySupporter: "Partidario Inicial de Nitro",
  TeamPseudoUser: "Equipo de Discord",
  VerifiedBot: "Bot Verificado",
  VerifiedDeveloper: "Desarrollador de Bots Verificado",
  CertifiedModerator: "Moderador Certificado",
  BotHTTPInteractions: "Interacciones HTTP",
  ActiveDeveloper: "Desarrollador Activo",
  Quarantined: "En Cuarentena",
  Spammer: "Spammer",
  Collaborator: "Colaborador",
  RestrictedCollaborator: "Colaborador Restringido",
};

function formatUserBadges(user) {
  const flags = user?.flags?.toArray() ?? [];
  if (!flags.length) return "Sin insignias";
  return flags.map((f) => `\`${BADGE_NAMES[f] ?? f}\``).join(", ");
}

function cleanDecoLabel(raw, fallback) {
  if (!raw || typeof raw !== "string" || /^\d{15,22}$/.test(raw)) return fallback;
  const cleaned = raw
    .replace(/^collectibles[/_.-]*/i, "")
    .replace(/^nameplates[/_.-]*/i, "")
    .replace(/[/_-]+/g, " ")
    .trim();
  if (!cleaned || /^\d+$/.test(cleaned)) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function resolveUser(ctx, input) {
  const invoker = ctx.user ?? ctx.author;
  if (!input) return invoker ?? null;
  if (typeof input === "object") return input.user ?? input;
  const match = String(input).trim().match(/^(?:<@!?)?(\d{17,20})>?$/);
  const client = ctx.bot ?? ctx.client ?? ctx.data?.client;
  if (match && client?.users) return client.users.fetch(match[1]).catch(() => null);
  return null;
}

function getMemberColor(member, fallback = DARK) {
  return member?.displayColor ? `#${member.displayColor.toString(16).padStart(6, "0")}` : fallback;
}

function buildRolesPayload(member, user, username, roles, page, totalPages, { prevId = null, nextId = null, extraRows = [], interactive = true, ephemeral = false } = {}) {
  const container = buildPaginatedListContainer({
    title: username,
    subtitle: "Roles del usuario",
    lines: roles.map((r, i) => `${page * 15 + i + 1}. ${r}`),
    footer: totalPages > 1 ? `Página ${page + 1}/${totalPages}` : null,
    thumbnailUrl: user.displayAvatarURL({ size: 256 }),
    color: getMemberColor(member, DARK),
    page,
    totalPages,
    prevId,
    nextId,
    extraRows,
    interactive,
  });
  return buildV2Payload(container, { ephemeral });
}

function buildPermsPayload(user, perms, page, totalPages, color, { prevId = null, nextId = null, extraRows = [], interactive = true, ephemeral = false } = {}) {
  const container = buildPaginatedListContainer({
    title: `Permisos de ${user.username}`,
    lines: perms,
    footer: totalPages > 1 ? `Página ${page + 1}/${totalPages}` : null,
    thumbnailUrl: user.displayAvatarURL({ size: 256 }),
    color: color || DARK,
    page,
    totalPages,
    prevId,
    nextId,
    extraRows,
    interactive,
  });
  return buildV2Payload(container, { ephemeral });
}

function buildUserImagePayload(user, { title, imageUrl, color, extraRows = [], ephemeral = false } = {}) {
  return buildV2Payload(
    buildImageViewContainer({
      authorName: user.username,
      title,
      imageUrl,
      color,
      extraRows,
    }),
    { ephemeral }
  );
}

function buildUserInfoPayload({ user, member = null, color = RED, extraRows = [], ephemeral = false } = {}) {
  const createdTs = Math.floor(user.createdTimestamp / 1000);
  const insignias = formatUserBadges(user);
  const generalBlock =
    `### General\n` +
    `> **ID:** \`${user.id}\`\n` +
    (member ? `> **Color del rol:** \`${color}\`\n` : "") +
    `> **Insignias:** ${insignias}\n` +
    `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`;

  const extraSections = [];
  if (member) {
    const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    extraSections.push(
      `### Servidor\n` +
      `> **Apodo:** ${member.nickname ?? "Sin apodo"}\n` +
      `> **Ingreso:** ${joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "No disponible"}`
    );
  }
  for (const field of buildExtendedFields(member, user)) {
    extraSections.push(`### ${field.name}\n${field.value}`);
  }

  const container = createContainer(color);
  addHeaderSection(
    container,
    [`## ${clipV2Text(user.username, 100)}`, generalBlock],
    user.displayAvatarURL({ size: 1024 })
  );

  if (extraSections.length) {
    addSeparator(container);
    addTextBlock(container, extraSections.join("\n\n"));
  }

  if (extraRows.length) {
    addSeparator(container, SeparatorSpacingSize.Small, false);
    for (const row of extraRows) {
      if (row) container.addActionRowComponents(row);
    }
  }

  return buildV2Payload(container, { ephemeral });
}

function makeSelectRow(customId, includeInfo, options) {
  const opts = (includeInfo
    ? [{ label: "Info", value: "info", description: "Información del usuario" }, ...options]
    : options
  ).map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder("Navegar...").addOptions(opts)
  );
}

function buildExtendedFields(member, user) {
  const fields = [];

  const pg = user.primaryGuild;
  if (pg?.tag) {
    const badgeURL = user.guildTagBadgeURL?.({ size: 4096 }) ?? null;
    fields.push({
      name: "Tag de servidor",
      value:
        `> **Etiqueta:** \`${pg.tag}\`\n` +
        `> **ID del servidor:** \`${pg.identityGuildId ?? "N/A"}\`\n` +
        `> **Insignia:** ${badgeURL ? `[Ver insignia](${badgeURL})` : "Sin insignia"}`,
    });
  }

  const activeDecData = member?.avatarDecorationData ?? user.avatarDecorationData ?? null;
  const avatarDecURL = member
    ? member.displayAvatarDecorationURL?.({ size: 4096 }) ?? user.avatarDecorationURL?.({ size: 4096 })
    : user.avatarDecorationURL?.({ size: 4096 });
  const nameplate = user.collectibles?.nameplate ?? null;

  const decoLines = [];
  if (activeDecData || avatarDecURL) {
    const decLink = avatarDecURL ? `[Ver decoración](${avatarDecURL})` : "Activa";
    const shopLink = activeDecData?.skuId
      ? ` • [Tienda](https://discord.com/shop#itemSkuId=${activeDecData.skuId})`
      : "";
    decoLines.push(`> **Decoración de avatar:** ${decLink}${shopLink}`);
  }
  if (nameplate) {
    const plateName = cleanDecoLabel(nameplate.label || nameplate.palette, "Ver placa");
    const plateLink = nameplate.skuId
      ? `[${plateName}](https://discord.com/shop#itemSkuId=${nameplate.skuId})`
      : plateName;
    decoLines.push(`> **Placa de nombre:** ${plateLink}`);
  }
  if (decoLines.length) {
    fields.push({ name: "Decoraciones", value: decoLines.join("\n") });
  }

  return fields;
}

const data = {
  data: new GroupBuilder({
    name: "user",
    description: "Comandos de usuario",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "info", description: "Muestra información general de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
          const guild = ctx.guild;

          if (!guild) {
            const user = await resolveUser(ctx, input);
            if (!user) return ctx.send("No pude encontrar al usuario");
            const fetched = await user.fetch(true).catch(() => user);
            const hasBanner = !!fetched.banner;
            const baseOptions = [
              { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
              ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
            ];
            const selectId = uniqueId("user_info_dm");

            let renderCurrent = (interactive = true) =>
              buildUserInfoPayload({
                user: fetched,
                color: RED,
                extraRows: interactive ? [makeSelectRow(selectId, false, baseOptions)] : [],
              });

            const reply = await ctx.send(renderCurrent(true));

            const collector = reply.createMessageComponentCollector({
              componentType: ComponentType.StringSelect,
              time: 5 * 60_000,
              filter: (i) => i.customId === selectId,
            });

            collector.on("collect", async (interaction) => {
              const selected = interaction.values[0];
              const isAuthor = interaction.user.id === invoker.id;

              if (selected === "info") {
                if (!isAuthor) return interaction.reply(buildUserInfoPayload({ user: fetched, color: RED, ephemeral: true }));
                renderCurrent = (interactive = true) =>
                  buildUserInfoPayload({
                    user: fetched,
                    color: RED,
                    extraRows: interactive ? [makeSelectRow(selectId, false, baseOptions)] : [],
                  });
                return interaction.update(renderCurrent(true));
              }
              if (selected === "avatar") {
                const url = fetched.displayAvatarURL({ size: 4096, extension: "png" });
                if (!isAuthor) {
                  return interaction.reply(buildUserImagePayload(fetched, { title: "Avatar", imageUrl: url, color: RED, ephemeral: true }));
                }
                renderCurrent = (interactive = true) =>
                  buildUserImagePayload(fetched, {
                    title: "Avatar",
                    imageUrl: url,
                    color: RED,
                    extraRows: interactive ? [makeSelectRow(selectId, true, baseOptions)] : [],
                  });
                return interaction.update(renderCurrent(true));
              }
              if (selected === "banner") {
                const bannerURL = fetched.bannerURL({ size: 4096 });
                if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
                if (!isAuthor) {
                  return interaction.reply(buildUserImagePayload(fetched, { title: "Banner", imageUrl: bannerURL, color: RED, ephemeral: true }));
                }
                renderCurrent = (interactive = true) =>
                  buildUserImagePayload(fetched, {
                    title: "Banner",
                    imageUrl: bannerURL,
                    color: RED,
                    extraRows: interactive ? [makeSelectRow(selectId, true, baseOptions)] : [],
                  });
                return interaction.update(renderCurrent(true));
              }
            });

            collector.on("end", async (_c, reason) => {
              if (reason === "time") await reply.edit(renderCurrent(false)).catch(() => {});
            });
            return;
          }

          const member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");

          const user = await member.user.fetch(true).catch(() => member.user);
          const fullMember = await member.fetch(true).catch(() => member);
          const getBannerUrl = () => fullMember.bannerURL?.({ size: 4096 }) ?? user.bannerURL({ size: 4096 }) ?? null;
          const colorRol = getMemberColor(member, DARK);
          const hasBanner = !!(user.banner || fullMember.banner);

          const baseOptions = [
            { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
            ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
            { label: "Roles", value: "roles", description: "Roles del usuario" },
            { label: "Permisos", value: "permissions", description: "Permisos del usuario" },
          ];
          const selectId = uniqueId("user_info_select");
          const authorId = invoker.id;
          const activeSubCollectors = new Map();
          const setSubCollector = (name, c) => {
            activeSubCollectors.get(name)?.stop();
            activeSubCollectors.set(name, c);
            c.once("end", () => activeSubCollectors.delete(name));
          };
          const stopSubCollectors = () => {
            activeSubCollectors.forEach((c) => c.stop());
            activeSubCollectors.clear();
          };

          let renderCurrent = (interactive = true) =>
            buildUserInfoPayload({
              user,
              member: fullMember,
              color: colorRol,
              extraRows: interactive ? [makeSelectRow(selectId, false, baseOptions)] : [],
            });

          const reply = await ctx.send(renderCurrent(true));

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 5 * 60_000,
            filter: (i) => i.customId === selectId,
          });

          collector.on("collect", async (interaction) => {
            const isAuthor = interaction.user.id === authorId;
            const selected = interaction.values[0];

            if (!isAuthor) {
              if (selected === "info") {
                return interaction.reply(buildUserInfoPayload({ user, member: fullMember, color: colorRol, ephemeral: true }));
              }
              if (selected === "avatar") {
                const url = member.displayAvatarURL({ extension: "png", size: 4096 });
                return interaction.reply(buildUserImagePayload(user, { title: "Avatar", imageUrl: url, color: colorRol, ephemeral: true }));
              }
              if (selected === "banner") {
                const bannerURL = getBannerUrl();
                if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
                return interaction.reply(buildUserImagePayload(user, { title: "Banner", imageUrl: bannerURL, color: colorRol, ephemeral: true }));
              }
              if (selected === "roles") {
                const roles = Array.from(
                  member.roles.cache
                    .filter((r) => r.id !== guild.id)
                    .sort((a, b) => b.position - a.position)
                    .values()
                ).map((r, i) => `${i + 1}. <@&${r.id}>`);
                if (!roles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
                return interaction.reply(
                  buildV2Payload(
                    buildSimpleContainer({
                      title: user.username,
                      subtitle: "Roles del usuario",
                      body: roles.join("\n"),
                      thumbnailUrl: user.displayAvatarURL({ size: 256 }),
                      color: colorRol,
                    }),
                    { ephemeral: true }
                  )
                );
              }
              if (selected === "permissions") {
                const perms = member.permissions.toArray().sort().map(formatPermName);
                if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });
                return interaction.reply(
                  buildV2Payload(
                    buildSimpleContainer({
                      title: `Permisos de ${user.username}`,
                      body: perms.join("\n"),
                      thumbnailUrl: user.displayAvatarURL({ size: 256 }),
                      color: colorRol,
                    }),
                    { ephemeral: true }
                  )
                );
              }
              return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
            }

            stopSubCollectors();

            if (selected === "info") {
              renderCurrent = (interactive = true) =>
                buildUserInfoPayload({
                  user,
                  member: fullMember,
                  color: colorRol,
                  extraRows: interactive ? [makeSelectRow(selectId, false, baseOptions)] : [],
                });
              return interaction.update(renderCurrent(true));
            }

            if (selected === "avatar") {
              const avatarOpts = { extension: "png", size: 4096 };
              const serverAvatar = member.displayAvatarURL(avatarOpts);
              const globalAvatar = user.displayAvatarURL(avatarOpts);
              const hasDistinct = !!(member.avatar && member.avatar !== user.avatar);

              const buildAv = (type, rows = []) =>
                buildUserImagePayload(user, {
                  title: hasDistinct ? (type === "server" ? "Avatar del servidor" : "Avatar global") : "Avatar",
                  imageUrl: type === "server" ? serverAvatar : globalAvatar,
                  color: colorRol,
                  extraRows: rows,
                });

              if (hasDistinct) {
                const avSelectId = uniqueId("user_av");
                const avRow = new ActionRowBuilder().addComponents(
                  new StringSelectMenuBuilder().setCustomId(avSelectId).setPlaceholder("Tipo de avatar...")
                    .addOptions(
                      new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setValue("server").setDescription("Avatar de servidor"),
                      new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setValue("global").setDescription("Avatar global"),
                    )
                );
                let avType = "server";
                renderCurrent = (interactive = true, includeAvSelect = true) =>
                  buildAv(avType, interactive ? (includeAvSelect ? [makeSelectRow(selectId, true, baseOptions), avRow] : [makeSelectRow(selectId, true, baseOptions)]) : []);

                await interaction.update(renderCurrent(true, true));

                const avCollector = reply.createMessageComponentCollector({
                  componentType: ComponentType.StringSelect,
                  time: 60_000,
                  filter: (i) => i.customId === avSelectId && i.user.id === authorId,
                });
                setSubCollector("avatar", avCollector);
                avCollector.on("collect", async (i) => {
                  avType = i.values[0];
                  await i.update(renderCurrent(true, true));
                });
                avCollector.on("end", async (_c, reason) => {
                  if (reason === "time") {
                    renderCurrent = (interactive = true) =>
                      buildAv(avType, interactive ? [makeSelectRow(selectId, true, baseOptions)] : []);
                    reply.edit(renderCurrent(true)).catch(() => {});
                  }
                });
              } else {
                renderCurrent = (interactive = true) =>
                  buildAv("server", interactive ? [makeSelectRow(selectId, true, baseOptions)] : []);
                await interaction.update(renderCurrent(true));
              }
              return;
            }

            if (selected === "banner") {
              const bannerURL = getBannerUrl();
              if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
              renderCurrent = (interactive = true) =>
                buildUserImagePayload(user, {
                  title: "Banner",
                  imageUrl: bannerURL,
                  color: colorRol,
                  extraRows: interactive ? [makeSelectRow(selectId, true, baseOptions)] : [],
                });
              return interaction.update(renderCurrent(true));
            }

            if (selected === "roles" || selected === "permissions") {
              const isRoles = selected === "roles";
              const items = isRoles
                ? member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => `<@&${r.id}>`)
                : member.permissions.toArray().sort().map(formatPermName);

              if (!items.length) {
                return interaction.reply({
                  content: isRoles ? "Este usuario no tiene roles" : "Este usuario no tiene permisos",
                  flags: MessageFlags.Ephemeral,
                });
              }

              const pages = paginateArray(items);
              let page = 0;
              const prevId = uniqueId(isRoles ? "roles_prev" : "perms_prev");
              const nextId = uniqueId(isRoles ? "roles_next" : "perms_next");
              const buildPagePayload = (pg, { extraRows = [], interactive = true } = {}) =>
                isRoles
                  ? buildRolesPayload(member, user, user.username, pages[pg], pg, pages.length, { prevId, nextId, extraRows, interactive })
                  : buildPermsPayload(user, pages[pg], pg, pages.length, colorRol, { prevId, nextId, extraRows, interactive });

              renderCurrent = (interactive = true, includePag = true) =>
                buildPagePayload(page, {
                  extraRows: interactive ? [makeSelectRow(selectId, true, baseOptions)] : [],
                  interactive: interactive && includePag,
                });

              await interaction.update(renderCurrent(true, true));
              if (pages.length <= 1) return;

              const subCollector = reply.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 2 * 60_000,
                filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
              });
              setSubCollector(selected, subCollector);
              subCollector.on("collect", async (i) => {
                page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
                await i.update(renderCurrent(true, true));
              });
              subCollector.on("end", async (_c, reason) => {
                if (reason === "time") {
                  renderCurrent = (interactive = true) =>
                    buildPagePayload(page, {
                      extraRows: interactive ? [makeSelectRow(selectId, true, baseOptions)] : [],
                      interactive: false,
                    });
                  reply.edit(renderCurrent(true)).catch(() => {});
                }
              });
            }
          });

          collector.on("end", async (_c, reason) => {
            stopSubCollectors();
            if (reason === "time") await reply.edit(renderCurrent(false)).catch(() => {});
          });
        } catch (err) {
          log.error("Error en user info", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "avatar", description: "Muestra el avatar de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
          let user;
          let member = null;

          if (ctx.guild) {
            member = await resolveMember(ctx, input);
            if (!member) return ctx.send("No pude encontrar al usuario");
            user = member.user;
          } else {
            user = await resolveUser(ctx, input);
            if (!user) return ctx.send("No pude encontrar al usuario");
          }

          const avatarOpts = { extension: "png", size: 4096 };
          const serverAvatar = member ? member.displayAvatarURL(avatarOpts) : user.displayAvatarURL(avatarOpts);
          const globalAvatar = user.displayAvatarURL(avatarOpts);
          const hasDistinct = !!(member?.avatar && member.avatar !== user.avatar);
          const color = getMemberColor(member, member ? DARK : RED);

          const buildAvatarPayload = (type, interactive = true) =>
            buildUserImagePayload(user, {
              title: hasDistinct ? (type === "server" ? "Avatar del servidor" : "Avatar global") : "Avatar",
              imageUrl: type === "server" ? serverAvatar : globalAvatar,
              color,
              extraRows: interactive && hasDistinct
                ? [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(selectId).setPlaceholder("Tipo de avatar...")
                      .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setDescription("Avatar de servidor").setValue("server"),
                        new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setDescription("Avatar global").setValue("global")
                      )
                  )]
                : [],
            });

          const selectId = uniqueId("avatar_select");
          let currentType = "server";
          const reply = await ctx.send(buildAvatarPayload(currentType, true));
          if (!hasDistinct) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000,
            filter: (i) => i.customId === selectId,
          });

          collector.on("collect", async (interaction) => {
            const selectedType = interaction.values[0];
            if (interaction.user.id !== invoker.id) {
              return interaction.reply(
                buildUserImagePayload(user, {
                  title: selectedType === "server" ? "Avatar del servidor" : "Avatar global",
                  imageUrl: selectedType === "server" ? serverAvatar : globalAvatar,
                  color,
                  ephemeral: true,
                })
              );
            }
            currentType = selectedType;
            await interaction.update(buildAvatarPayload(currentType, true));
          });

          collector.on("end", async (_c, reason) => {
            if (reason === "time") await reply.edit(buildAvatarPayload(currentType, false)).catch(() => {});
          });
        } catch (err) {
          log.error("Error en user avatar", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "banner", description: "Muestra el banner de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
          let user;
          let member = null;

          if (ctx.guild) {
            member = await resolveMember(ctx, input);
            if (!member) return ctx.send("No pude encontrar al usuario");
            user = await member.user.fetch(true).catch(() => member.user);
            member = await member.fetch(true).catch(() => member);
          } else {
            user = await resolveUser(ctx, input);
            if (!user) return ctx.send("No pude encontrar al usuario");
            user = await user.fetch(true).catch(() => user);
          }

          const serverBannerURL = member?.bannerURL?.({ size: 4096 }) ?? null;
          const globalBannerURL = user.bannerURL({ size: 4096 });
          if (!globalBannerURL && !serverBannerURL) return ctx.send("Este usuario no tiene banner");

          const hasDistinct = !!(serverBannerURL && globalBannerURL && serverBannerURL !== globalBannerURL);
          const color = getMemberColor(member, member ? DARK : RED);

          const selectId = uniqueId("banner_select");
          const buildBannerPayload = (type, interactive = true) => {
            const isServer = type === "server";
            const url = isServer ? serverBannerURL : globalBannerURL;
            return buildUserImagePayload(user, {
              title: hasDistinct ? (isServer ? "Banner del servidor" : "Banner global") : "Banner",
              imageUrl: url,
              color,
              extraRows: interactive && hasDistinct
                ? [new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(selectId).setPlaceholder("Tipo de banner...")
                      .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel("Banner del Servidor").setDescription("Banner de servidor").setValue("server"),
                        new StringSelectMenuOptionBuilder().setLabel("Banner Global").setDescription("Banner global").setValue("global")
                      )
                  )]
                : [],
            });
          };

          let currentType = serverBannerURL ? "server" : "global";
          const reply = await ctx.send(buildBannerPayload(currentType, true));
          if (!hasDistinct) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000,
            filter: (i) => i.customId === selectId,
          });

          collector.on("collect", async (interaction) => {
            const selectedType = interaction.values[0];
            if (interaction.user.id !== invoker.id) {
              const isServer = selectedType === "server";
              return interaction.reply(
                buildUserImagePayload(user, {
                  title: isServer ? "Banner del servidor" : "Banner global",
                  imageUrl: isServer ? serverBannerURL : globalBannerURL,
                  color,
                  ephemeral: true,
                })
              );
            }
            currentType = selectedType;
            await interaction.update(buildBannerPayload(currentType, true));
          });

          collector.on("end", async (_c, reason) => {
            if (reason === "time") await reply.edit(buildBannerPayload(currentType, false)).catch(() => {});
          });
        } catch (err) {
          log.error("Error en user banner", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "roles", description: "Muestra los roles de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          if (!ctx.guild) return noGuildReply(ctx);
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
          const member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");

          const user = member.user;
          const allRoles = member.roles.cache
            .filter((r) => r.id !== ctx.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((r) => `<@&${r.id}>`);

          if (!allRoles.length) return ctx.send("Este usuario no tiene roles");

          const pages = paginateArray(allRoles);
          let page = 0;
          const prevId = uniqueId("roles_prev");
          const nextId = uniqueId("roles_next");

          const reply = await ctx.send(
            buildRolesPayload(member, user, user.username, pages[page], page, pages.length, { prevId, nextId, interactive: true })
          );
          if (pages.length <= 1) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60_000,
            filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === invoker.id,
          });

          collector.on("collect", async (i) => {
            page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
            await i.update(
              buildRolesPayload(member, user, user.username, pages[page], page, pages.length, { prevId, nextId, interactive: true })
            );
          });

          collector.on("end", async (_c, reason) => {
            if (reason === "time") {
              await reply.edit(
                buildRolesPayload(member, user, user.username, pages[page], page, pages.length, { interactive: false })
              ).catch(() => {});
            }
          });
        } catch (err) {
          log.error("Error en user roles", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "permissions", description: "Muestra los permisos de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          if (!ctx.guild) return noGuildReply(ctx);
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
          const member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");

          const user = member.user;
          const color = getMemberColor(member, DARK);
          const perms = member.permissions.toArray().sort().map(formatPermName);

          if (!perms.length) return ctx.send("Este usuario no tiene permisos");

          const pages = paginateArray(perms);
          let page = 0;
          const prevId = uniqueId("perms_prev");
          const nextId = uniqueId("perms_next");

          const reply = await ctx.send(
            buildPermsPayload(user, pages[page], page, pages.length, color, { prevId, nextId, interactive: true })
          );
          if (pages.length <= 1) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60_000,
            filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === invoker.id,
          });

          collector.on("collect", async (i) => {
            page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
            await i.update(
              buildPermsPayload(user, pages[page], page, pages.length, color, { prevId, nextId, interactive: true })
            );
          });

          collector.on("end", async (_c, reason) => {
            if (reason === "time") {
              await reply.edit(
                buildPermsPayload(user, pages[page], page, pages.length, color, { interactive: false })
              ).catch(() => {});
            }
          });
        } catch (err) {
          log.error("Error en user permissions", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "random",
        description: "Elige a un miembro del servidor al azar",
      }),
      params: new ParamsBuilder().addRole({
        name: "rol",
        description: "Filtrar entre miembros de un rol específico (opcional)",
        required: false,
      }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          if (!ctx.guild) return noGuildReply(ctx);

          const role = ctx.get("rol") ?? null;
          if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
            await ctx.guild.members.fetch().catch(() => {});
          }

          let pool = ctx.guild.members.cache;
          if (role) {
            pool = pool.filter((m) => m.roles.cache.has(role.id));
          }

          const humans = pool.filter((m) => !m.user.bot);
          const candidates = humans.size > 0 ? humans : pool;

          if (!candidates.size) {
            return ctx.send({
              content: role ? `No hay miembros con el rol ${role}` : "No se encontraron miembros en el servidor",
              flags: MessageFlags.Ephemeral,
            });
          }

          const chosen = candidates.random();
          const user = chosen.user;
          const color = getMemberColor(chosen, RED);
          const joinedTs = chosen.joinedTimestamp ? Math.floor(chosen.joinedTimestamp / 1000) : null;

          const randomContainer = buildSimpleContainer({
            title: "Usuario al azar",
            body:
              `> **Seleccionado:** ${chosen} (\`${user.username}\`)\n` +
              `> **ID:** \`${user.id}\`` +
              (role ? `\n> **Rol filtrado:** ${role}` : "") +
              (joinedTs ? `\n> **Ingreso:** <t:${joinedTs}:R>` : ""),
            thumbnailUrl: chosen.displayAvatarURL({ size: 1024 }),
            color,
          });

          await ctx.send(buildV2Payload(randomContainer));
        } catch (err) {
          log.error("Error en user random", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    }),
};

module.exports = { data };
