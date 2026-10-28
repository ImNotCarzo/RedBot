const { CommandBuilder, GroupBuilder, ParamsBuilder } = require("gralonium");
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const {
  Logger,
  clampPage,
  noGuildReply,
  buildPaginationRow,
  uniqueId,
  formatPermissionName: formatPermName,
  paginateArray,
  handleCommandError,
} = require("../../src/runtime");
const { resolveMemberFlexible: resolveMember } = require("../../src/adapter");
const { RED, DARK } = require("../../src/config");

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
  if (match) return (ctx.client ?? ctx.bot).users.fetch(match[1]).catch(() => null);
  return null;
}

function getMemberColor(member, fallback = DARK) {
  return member?.displayColor ? `#${member.displayColor.toString(16).padStart(6, "0")}` : fallback;
}

function buildRolesEmbed(member, user, username, roles, page, totalPages) {
  const numbered = roles.map((r, i) => `${page * 15 + i + 1}. ${r}`);
  const embed = new EmbedBuilder()
    .setAuthor({ name: username, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(numbered.join("\n"))
    .setColor(getMemberColor(member, DARK))
    .setTimestamp();
  if (totalPages > 1) embed.setFooter({ text: `Página ${page + 1}/${totalPages}` });
  return embed;
}

function buildPermsEmbed(user, perms, page, totalPages, color) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: `Permisos de ${user.username}`, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(perms.join("\n"))
    .setColor(color || DARK)
    .setTimestamp();
  if (totalPages > 1) embed.setFooter({ text: `Página ${page + 1}/${totalPages}` });
  return embed;
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
            if (!user) return ctx.send("No se encontró ningún usuario");
            const fetched = await user.fetch(true).catch(() => user);
            const createdTs = Math.floor(fetched.createdTimestamp / 1000);
            const insignias = formatUserBadges(fetched);

            const embed = new EmbedBuilder()
              .setThumbnail(fetched.displayAvatarURL({ size: 1024 }))
              .setColor(RED)
              .setTitle(`${fetched.username}`)
              .addFields(
                {
                  name: "General",
                  value:
                    `> **ID:** \`${fetched.id}\`\n` +
                    `> **Insignias:** ${insignias}\n` +
                    `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
                },
                ...buildExtendedFields(null, fetched)
              )
              .setTimestamp();

            const hasBanner = !!fetched.banner;
            const baseOptions = [
              { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
              ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
            ];
            const selectId = uniqueId("user_info_dm");

            const reply = await ctx.send({
              embeds: [embed],
              components: [makeSelectRow(selectId, false, baseOptions)],
            });

            const collector = reply.createMessageComponentCollector({
              componentType: ComponentType.StringSelect,
              time: 5 * 60_000,
              filter: (i) => i.customId === selectId,
            });

            collector.on("collect", async (interaction) => {
              const selected = interaction.values[0];
              const isAuthor = interaction.user.id === invoker.id;

              if (selected === "info") {
                if (!isAuthor) return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return interaction.update({ embeds: [embed], components: [makeSelectRow(selectId, false, baseOptions)] });
              }
              if (selected === "avatar") {
                const url = fetched.displayAvatarURL({ size: 4096, extension: "png" });
                const av = new EmbedBuilder()
                  .setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) })
                  .setTitle("Avatar").setURL(url).setImage(url).setColor(RED).setTimestamp();
                if (!isAuthor) return interaction.reply({ embeds: [av], flags: MessageFlags.Ephemeral });
                return interaction.update({ embeds: [av], components: [makeSelectRow(selectId, true, baseOptions)] });
              }
              if (selected === "banner") {
                const bannerURL = fetched.bannerURL({ size: 4096 });
                if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
                const bn = new EmbedBuilder()
                  .setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) })
                  .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(RED).setTimestamp();
                if (!isAuthor) return interaction.reply({ embeds: [bn], flags: MessageFlags.Ephemeral });
                return interaction.update({ embeds: [bn], components: [makeSelectRow(selectId, true, baseOptions)] });
              }
            });

            collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
            return;
          }

          const member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No se encontró ningún usuario");

          const user = await member.user.fetch(true).catch(() => member.user);
          const fullMember = await member.fetch(true).catch(() => member);
          const getBannerUrl = () => fullMember.bannerURL?.({ size: 4096 }) ?? user.bannerURL({ size: 4096 }) ?? null;
          const insignias = formatUserBadges(user);
          const colorRol = getMemberColor(member, DARK);
          const createdTs = Math.floor(user.createdTimestamp / 1000);
          const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
          const hasBanner = !!(user.banner || fullMember.banner);

          const fields = [
            {
              name: "General",
              value:
                `> **ID:** \`${user.id}\`\n` +
                `> **Color del rol:** \`${colorRol}\`\n` +
                `> **Insignias:** ${insignias}\n` +
                `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
            },
            {
              name: "Servidor",
              value:
                `> **Apodo:** ${member.nickname ?? "Sin apodo"}\n` +
                `> **Ingreso:** ${joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "No disponible"}`,
            },
            ...buildExtendedFields(fullMember, user),
          ];

          const infoEmbed = new EmbedBuilder()
            .setThumbnail(user.displayAvatarURL({ size: 1024 }))
            .setColor(colorRol)
            .setTitle(`${user.username}`)
            .addFields(fields)
            .setTimestamp();

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

          const reply = await ctx.send({
            embeds: [infoEmbed],
            components: [makeSelectRow(selectId, false, baseOptions)],
          });

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
                return interaction.reply({ embeds: [infoEmbed], flags: MessageFlags.Ephemeral });
              }
              if (selected === "avatar") {
                const url = member.displayAvatarURL({ extension: "png", size: 4096 });
                const av = new EmbedBuilder()
                  .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                  .setTitle("Avatar").setURL(url).setImage(url).setColor(colorRol).setTimestamp();
                return interaction.reply({ embeds: [av], flags: MessageFlags.Ephemeral });
              }
              if (selected === "banner") {
                const bannerURL = getBannerUrl();
                if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
                const bn = new EmbedBuilder()
                  .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                  .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp();
                return interaction.reply({ embeds: [bn], flags: MessageFlags.Ephemeral });
              }
              if (selected === "roles") {
                const roles = member.roles.cache
                  .filter((r) => r.id !== guild.id)
                  .sort((a, b) => b.position - a.position)
                  .map((r, i) => `${i + 1}. <@&${r.id}>`);
                if (!roles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
                let desc = roles.join("\n");
                if (desc.length > 4000) desc = desc.slice(0, 3990) + "\n...";
                const embed = new EmbedBuilder()
                  .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                  .setDescription(desc).setColor(colorRol).setTimestamp();
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
              }
              if (selected === "permissions") {
                const perms = member.permissions.toArray().sort().map(formatPermName);
                if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });
                let desc = perms.join("\n");
                if (desc.length > 4000) desc = desc.slice(0, 3990) + "\n...";
                const embed = new EmbedBuilder()
                  .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                  .setDescription(desc).setColor(colorRol).setTimestamp();
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
              }
              return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
            }

            stopSubCollectors();

            if (selected === "info") {
              return interaction.update({ embeds: [infoEmbed], components: [makeSelectRow(selectId, false, baseOptions)] });
            }

            if (selected === "avatar") {
              const avatarOpts = { extension: "png", size: 4096 };
              const serverAvatar = member.displayAvatarURL(avatarOpts);
              const globalAvatar = user.displayAvatarURL(avatarOpts);
              const hasDistinct = !!(member.avatar && member.avatar !== user.avatar);

              const buildAv = (type) => new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setTitle(hasDistinct ? (type === "server" ? "Avatar del servidor" : "Avatar global") : "Avatar")
                .setURL(type === "server" ? serverAvatar : globalAvatar)
                .setImage(type === "server" ? serverAvatar : globalAvatar)
                .setColor(colorRol).setTimestamp();

              if (hasDistinct) {
                const avSelectId = uniqueId("user_av");
                const avRow = new ActionRowBuilder().addComponents(
                  new StringSelectMenuBuilder().setCustomId(avSelectId).setPlaceholder("Tipo de avatar...")
                    .addOptions(
                      new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setValue("server").setDescription("Avatar de servidor"),
                      new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setValue("global").setDescription("Avatar global"),
                    )
                );
                await interaction.update({ embeds: [buildAv("server")], components: [makeSelectRow(selectId, true, baseOptions), avRow] });

                const avCollector = reply.createMessageComponentCollector({
                  componentType: ComponentType.StringSelect,
                  time: 60_000,
                  filter: (i) => i.customId === avSelectId && i.user.id === authorId,
                });
                setSubCollector("avatar", avCollector);
                avCollector.on("collect", async (i) => {
                  await i.update({ embeds: [buildAv(i.values[0])], components: [makeSelectRow(selectId, true, baseOptions), avRow] });
                });
              } else {
                await interaction.update({ embeds: [buildAv("server")], components: [makeSelectRow(selectId, true, baseOptions)] });
              }
              return;
            }

            if (selected === "banner") {
              const bannerURL = getBannerUrl();
              if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
              return interaction.update({
                embeds: [new EmbedBuilder()
                  .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                  .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp()],
                components: [makeSelectRow(selectId, true, baseOptions)],
              });
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
              const buildPageEmbed = (pg) => isRoles
                ? buildRolesEmbed(member, user, user.username, pages[pg], pg, pages.length)
                : buildPermsEmbed(user, pages[pg], pg, pages.length, colorRol);

              await interaction.update({
                embeds: [buildPageEmbed(page)],
                components: pages.length > 1
                  ? [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)]
                  : [makeSelectRow(selectId, true, baseOptions)],
              });
              if (pages.length <= 1) return;

              const subCollector = reply.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 2 * 60_000,
                filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
              });
              setSubCollector(selected, subCollector);
              subCollector.on("collect", async (i) => {
                page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
                await i.update({
                  embeds: [buildPageEmbed(page)],
                  components: [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)],
                });
              });
              subCollector.on("end", async () => reply.edit({ components: [makeSelectRow(selectId, true, baseOptions)] }).catch(() => {}));
            }
          });

          collector.on("end", async () => {
            stopSubCollectors();
            await reply.edit({ components: [] }).catch(() => {});
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

          const buildEmbed = (type) => new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
            .setTitle(hasDistinct ? (type === "server" ? "Avatar del servidor" : "Avatar global") : "Avatar")
            .setURL(type === "server" ? serverAvatar : globalAvatar)
            .setImage(type === "server" ? serverAvatar : globalAvatar)
            .setColor(color).setTimestamp();

          const selectId = uniqueId("avatar_select");
          const selectRow = hasDistinct
            ? [new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(selectId).setPlaceholder("Tipo de avatar...")
                  .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setDescription("Avatar de servidor").setValue("server"),
                    new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setDescription("Avatar global").setValue("global")
                  )
              )]
            : [];

          const reply = await ctx.send({ embeds: [buildEmbed("server")], components: selectRow });
          if (!hasDistinct) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000,
            filter: (i) => i.customId === selectId,
          });

          collector.on("collect", async (interaction) => {
            if (interaction.user.id !== invoker.id) {
              return interaction.reply({ embeds: [buildEmbed(interaction.values[0])], flags: MessageFlags.Ephemeral });
            }
            await interaction.update({ embeds: [buildEmbed(interaction.values[0])] });
          });

          collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
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

          const buildEmbed = (type) => {
            const isServer = type === "server";
            const url = isServer ? serverBannerURL : globalBannerURL;
            return new EmbedBuilder()
              .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
              .setTitle(hasDistinct ? (isServer ? "Banner del servidor" : "Banner global") : "Banner")
              .setURL(url).setImage(url).setColor(color).setTimestamp();
          };

          const selectId = uniqueId("banner_select");
          const selectRow = hasDistinct
            ? [new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(selectId).setPlaceholder("Tipo de banner...")
                  .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel("Banner del Servidor").setDescription("Banner de servidor").setValue("server"),
                    new StringSelectMenuOptionBuilder().setLabel("Banner Global").setDescription("Banner global").setValue("global")
                  )
              )]
            : [];

          const reply = await ctx.send({ embeds: [buildEmbed(serverBannerURL ? "server" : "global")], components: selectRow });
          if (!hasDistinct) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000,
            filter: (i) => i.customId === selectId,
          });

          collector.on("collect", async (interaction) => {
            if (interaction.user.id !== invoker.id) {
              return interaction.reply({ embeds: [buildEmbed(interaction.values[0])], flags: MessageFlags.Ephemeral });
            }
            await interaction.update({ embeds: [buildEmbed(interaction.values[0])] });
          });

          collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
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

          const reply = await ctx.send({
            embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
            components: pages.length > 1 ? [buildPaginationRow(prevId, nextId, page, pages.length)] : [],
          });
          if (pages.length <= 1) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60_000,
            filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === invoker.id,
          });

          collector.on("collect", async (i) => {
            page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
            await i.update({
              embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
              components: [buildPaginationRow(prevId, nextId, page, pages.length)],
            });
          });

          collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
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

          const reply = await ctx.send({
            embeds: [buildPermsEmbed(user, pages[page], page, pages.length, color)],
            components: pages.length > 1 ? [buildPaginationRow(prevId, nextId, page, pages.length)] : [],
          });
          if (pages.length <= 1) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60_000,
            filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === invoker.id,
          });

          collector.on("collect", async (i) => {
            page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
            await i.update({
              embeds: [buildPermsEmbed(user, pages[page], page, pages.length, color)],
              components: [buildPaginationRow(prevId, nextId, page, pages.length)],
            });
          });

          collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
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

          const embed = new EmbedBuilder()
            .setTitle("Usuario al azar")
            .setThumbnail(chosen.displayAvatarURL({ size: 1024 }))
            .setDescription(
              `> **Seleccionado:** ${chosen} (\`${user.username}\`)\n` +
              `> **ID:** \`${user.id}\`` +
              (role ? `\n> **Rol filtrado:** ${role}` : "") +
              (joinedTs ? `\n> **Ingreso:** <t:${joinedTs}:R>` : "")
            )
            .setColor(color)
            .setTimestamp();

          await ctx.send({ embeds: [embed] });
        } catch (err) {
          log.error("Error en user random", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    }),
};

module.exports = { data };
