const { CommandBuilder, GroupBuilder, ParamsBuilder } = require("gralonium");
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const { createCommandLogger, clampPage } = require("./_shared/runtime");
const { resolveMemberFlexible } = require("../src/resolvers/member.resolver");

const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";
const log = createCommandLogger("CMD_USER");

/* ══════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════ */

function noGuildReply(ctx) {
  return ctx.send({
    embeds: [new EmbedBuilder().setDescription("No estoy en este servidor").setColor("#ff383d")],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Invítame").setStyle(ButtonStyle.Link).setURL(INVITE_URL)
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function resolveMember(ctx, input) {
  return resolveMemberFlexible(ctx, input);
}

async function resolveUser(ctx, input) {
  const invoker = ctx.user ?? ctx.author;
  if (!input) return invoker ?? null;
  if (typeof input === "object") return input.user ?? input;
  const id = String(input).replace(/\D/g, "");
  if (id) return ctx.bot.users.fetch(id).catch(() => null);
  return null;
}

function buildRolesEmbed(member, user, username, roles, page, totalPages) {
  const numbered = roles.map((r, i) => `${page * 15 + i + 1}. ${r}`);
  const embed = new EmbedBuilder()
    .setAuthor({ name: username, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(numbered.join("\n"))
    .setColor(member.displayHexColor || "#2b2d31")
    .setTimestamp();
  if (totalPages > 1) embed.setFooter({ text: `Página ${page + 1}/${totalPages}` });
  return embed;
}

function buildPermsEmbed(user, perms, page, totalPages, color) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: `Permisos de ${user.username}`, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(perms.join("\n"))
    .setColor(color || "#2b2d31")
    .setTimestamp();
  if (totalPages > 1) embed.setFooter({ text: `Página ${page + 1}/${totalPages}` });
  return embed;
}

function buildPaginationRow(prevId, nextId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
  );
}

function makeSelectRow(customId, includeInfo, options) {
  const opts = (includeInfo
    ? [{ label: "Info", value: "info", description: "Información del usuario" }, ...options]
    : options
  ).map(o => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder("Navegar...").addOptions(opts)
  );
}

function uniqueId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatPermName(p) {
  return `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}\``;
}

function paginateArray(arr, size = 15) {
  const pages = [];
  for (let i = 0; i < arr.length; i += size) pages.push(arr.slice(i, i + size));
  return pages;
}

/* ══════════════════════════════════════════
   Collector manager
   ══════════════════════════════════════════ */

function createCollectorManager() {
  const active = new Map();
  return {
    set(name, collector) {
      this.stop(name);
      active.set(name, collector);
      collector.once("end", () => active.delete(name));
    },
    stop(name) {
      active.get(name)?.stop();
      active.delete(name);
    },
    stopAll() {
      active.forEach(c => c.stop());
      active.clear();
    }
  };
}

/* ══════════════════════════════════════════
   Extended profile data
   Usa las APIs nativas de DJS 14.21+:
   - user.primaryGuild       → Guild Tag (tag, identityGuildId, badge hash)
   - user.guildTagBadgeURL() → URL de la insignia del tag
   - user.avatarDecorationData / user.avatarDecorationURL() → decoración global
   - member.avatarDecorationData / member.displayAvatarDecorationURL() → deco de servidor
   - user.collectibles?.nameplate → Placa (label, asset, palette)
   NO existe profileEffect en la API pública de DJS.
   ══════════════════════════════════════════ */

function buildExtendedFields(member, user) {
  const fields = [];

  // ── Guild Tag ──────────────────────────────────────────────
  // user.primaryGuild está disponible tras user.fetch()
  const pg = user.primaryGuild;
  if (pg?.tag) {
    const badgeURL = user.guildTagBadgeURL({ size: 4096 });
    fields.push({
      name: "Guild Tag",
      value:
        `> **Tag:** \`${pg.tag}\`\n` +
        `> **ID del servidor:** \`${pg.identityGuildId ?? "N/A"}\`\n` +
        `> **Mostrar insignia:** ${badgeURL ? `[Ver insignia](${badgeURL})` : "Sin insignia"}`,
    });
  }

  // ── Decoraciones ──────────────────────────────────────────
  // Avatar decoration: se prefiere la del servidor (member) sobre la global (user)
  const memberDecData  = member?.avatarDecorationData ?? null;
  const userDecData    = user.avatarDecorationData ?? null;
  const activeDecData  = memberDecData ?? userDecData;

  // URL: member.displayAvatarDecorationURL() incluye la del servidor si existe,
  // de lo contrario cae en la global automáticamente.
  const avatarDecURL = member
    ? member.displayAvatarDecorationURL?.({ size: 4096 }) ?? user.avatarDecorationURL?.({ size: 4096 })
    : user.avatarDecorationURL?.({ size: 4096 });

  // Nameplate (placa): user.collectibles?.nameplate
  // No hay URL directa — Discord usa el asset como path relativo en su CDN.
  // Construimos una URL de la Store de Discord con el skuId para que el usuario pueda verla.
  const nameplate = user.collectibles?.nameplate ?? null;

  const decoLines = [];
  if (activeDecData) {
    const decName = activeDecData.skuId ?? "Decoración de avatar";
    const decLine = avatarDecURL ? `[${decName}](${avatarDecURL})` : decName;
    decoLines.push(`> **Avatar:** ${decLine}`);
  }
  // Profile effect: no expuesto por la API pública de DJS → omitido
  if (nameplate) {
    const plateName  = nameplate.label || nameplate.skuId || "Placa de nombre";
    // Enlace a la tienda de Discord para ver la placa
    const plateLink  = nameplate.skuId
      ? `[${plateName}](https://discord.com/shop#itemSkuId=${nameplate.skuId})`
      : plateName;
    decoLines.push(`> **Placa:** ${plateLink}`);
  }
  if (decoLines.length) {
    fields.push({ name: "Decoraciones", value: decoLines.join("\n") });
  }

  return fields;
}

/* ══════════════════════════════════════════
   Command Group
   ══════════════════════════════════════════ */

const data = {
  data: new GroupBuilder({
    name: "user",
    description: "Comandos de usuario",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })

  // ══════════════════════════════════════════
  // user info
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({ name: "info", description: "Muestra información general de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        const input   = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const guild   = ctx.guild;

        // ── Sin servidor (DM) ──────────────────────────────
        if (!guild) {
          const user    = await resolveUser(ctx, input);
          if (!user) return ctx.send("No se encontró ningún usuario");
          const fetched = await user.fetch().catch(() => user);
          const createdTs = Math.floor(fetched.createdTimestamp / 1000);
          const insignias = fetched.flags?.toArray().map(f => `\`${f}\``).join(", ") || "Sin insignias";

          const embed = new EmbedBuilder()
            .setThumbnail(fetched.displayAvatarURL({ size: 1024 }))
            .setColor("#ff383d")
            .setTitle(`${fetched.id}`)
            .addFields({
              name: "General",
              value:
                `> **ID:** \`${fetched.id}\`\n` +
                `> **Insignias:** ${insignias}\n` +
                `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
            })
            .setTimestamp();

          const hasBanner   = !!fetched.banner;
          const baseOptions = [
            { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
            ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
          ];
          const selectId = uniqueId("user_info_dm");

          const reply = await ctx.send({
            embeds: [embed],
            components: [makeSelectRow(selectId, false, baseOptions)]
          });

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 5 * 60_000,
            filter: i => i.customId === selectId,
          });

          collector.on("collect", async interaction => {
            const selected = interaction.values[0];
            const isAuthor = interaction.user.id === invoker.id;

            if (selected === "info") {
              if (!isAuthor) return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [embed], components: [makeSelectRow(selectId, false, baseOptions)] });
            }
            if (selected === "avatar") {
              const url = fetched.displayAvatarURL({ size: 4096, extension: "png" });
              const av  = new EmbedBuilder()
                .setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) })
                .setTitle("Avatar").setURL(url).setImage(url).setColor("#ff383d").setTimestamp();
              if (!isAuthor) return interaction.reply({ embeds: [av], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [av], components: [makeSelectRow(selectId, true, baseOptions)] });
            }
            if (selected === "banner") {
              const bannerURL = fetched.bannerURL({ size: 4096 });
              if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
              const bn = new EmbedBuilder()
                .setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) })
                .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor("#ff383d").setTimestamp();
              if (!isAuthor) return interaction.reply({ embeds: [bn], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [bn], components: [makeSelectRow(selectId, true, baseOptions)] });
            }
          });

          collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
          return;
        }

        // ── Con servidor ───────────────────────────────────
        const member = await resolveMember(ctx, input);
        if (!member) return ctx.send("No se encontró ningún usuario");

        // fetch() fuerza la carga de banner, accentColor, primaryGuild, collectibles y avatarDecorationData
        const user        = await member.user.fetch().catch(() => member.user);
        const insignias   = user.flags?.toArray().map(f => `\`${f}\``).join(", ") || "Sin insignias";
        const colorRol    = member.displayHexColor || "#2b2d31";
        const createdTs   = Math.floor(user.createdTimestamp / 1000);
        const joinedTs    = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
        const hasBanner   = !!user.banner;

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
          // Guild Tag + Decoraciones desde las APIs nativas de DJS 14.21+
          ...buildExtendedFields(member, user),
        ];

        const infoEmbed = new EmbedBuilder()
          .setThumbnail(user.displayAvatarURL({ size: 1024 }))
          .setColor(colorRol)
          .setTitle(`${fetched.id}`)
          .addFields(fields)
          .setTimestamp();

        const baseOptions = [
          { label: "Avatar",   value: "avatar",      description: "Avatar del usuario" },
          ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
          { label: "Roles",    value: "roles",       description: "Roles del usuario" },
          { label: "Permisos", value: "permissions", description: "Permisos del usuario" },
        ];
        const selectId = uniqueId("user_info_select");
        const authorId = invoker.id;
        const cm       = createCollectorManager();

        const reply = await ctx.send({
          embeds: [infoEmbed],
          components: [makeSelectRow(selectId, false, baseOptions)]
        });

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 5 * 60_000,
          filter: i => i.customId === selectId,
        });

        collector.on("collect", async interaction => {
          const isAuthor = interaction.user.id === authorId;
          const selected = interaction.values[0];

          cm.stopAll();

          // ── Respuesta efímera para no-autores ──
          if (!isAuthor) {
            if (selected === "avatar") {
              const url = member.displayAvatarURL({ extension: "png", size: 4096 });
              const av  = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setTitle("Avatar").setURL(url).setImage(url).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [av], flags: MessageFlags.Ephemeral });
            }
            if (selected === "banner") {
              const bannerURL = user.bannerURL({ size: 4096 });
              if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
              const bn = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [bn], flags: MessageFlags.Ephemeral });
            }
            if (selected === "roles") {
              const roles = member.roles.cache
                .filter(r => r.id !== guild.id)
                .sort((a, b) => b.position - a.position)
                .map((r, i) => `${i + 1}. <@&${r.id}>`);
              if (!roles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
              const embed = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setDescription(roles.join("\n")).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            if (selected === "permissions") {
              const perms = member.permissions.toArray().sort().map(formatPermName);
              if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });
              const embed = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setDescription(perms.join("\n")).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
          }

          // ── Respuestas del autor ──
          if (selected === "info") {
            return interaction.update({ embeds: [infoEmbed], components: [makeSelectRow(selectId, false, baseOptions)] });
          }

          if (selected === "avatar") {
            const avatarOpts   = { extension: "png", size: 4096 };
            const serverAvatar = member.displayAvatarURL(avatarOpts);
            const globalAvatar = user.displayAvatarURL(avatarOpts);
            const hasDistinct  = !!(member.avatar && member.avatar !== user.avatar);

            const buildAv = (type) => new EmbedBuilder()
              .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
              .setTitle(type === "server" ? "Avatar del servidor" : "Avatar global")
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
                filter: i => i.customId === avSelectId && i.user.id === authorId,
              });
              cm.set("avatar", avCollector);
              avCollector.on("collect", async i => {
                await i.update({ embeds: [buildAv(i.values[0])], components: [makeSelectRow(selectId, true, baseOptions), avRow] });
              });
            } else {
              await interaction.update({ embeds: [buildAv("server")], components: [makeSelectRow(selectId, true, baseOptions)] });
            }
            return;
          }

          if (selected === "banner") {
            const bannerURL = user.bannerURL({ size: 4096 });
            if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
            return interaction.update({
              embeds: [new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp()],
              components: [makeSelectRow(selectId, true, baseOptions)],
            });
          }

          if (selected === "roles") {
            const allRoles = member.roles.cache
              .filter(r => r.id !== guild.id)
              .sort((a, b) => b.position - a.position)
              .map(r => `<@&${r.id}>`);
            if (!allRoles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });

            const pages = paginateArray(allRoles);
            let page = 0;
            const prevId = uniqueId("roles_prev");
            const nextId = uniqueId("roles_next");

            await interaction.update({
              embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
              components: pages.length > 1
                ? [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)]
                : [makeSelectRow(selectId, true, baseOptions)],
            });
            if (pages.length <= 1) return;

            const rCollector = reply.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 2 * 60_000,
              filter: i => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
            });
            cm.set("roles", rCollector);
            rCollector.on("collect", async i => {
              page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
              await i.update({
                embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
                components: [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)],
              });
            });
            rCollector.on("end", async () => reply.edit({ components: [makeSelectRow(selectId, true, baseOptions)] }).catch(() => {}));
            return;
          }

          if (selected === "permissions") {
            const perms = member.permissions.toArray().sort().map(formatPermName);
            if (!perms.length) return interaction.reply({ content: "Este usuario no tiene permisos", flags: MessageFlags.Ephemeral });

            const pages = paginateArray(perms);
            let page = 0;
            const prevId = uniqueId("perms_prev");
            const nextId = uniqueId("perms_next");

            await interaction.update({
              embeds: [buildPermsEmbed(user, pages[page], page, pages.length, colorRol)],
              components: pages.length > 1
                ? [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)]
                : [makeSelectRow(selectId, true, baseOptions)],
            });
            if (pages.length <= 1) return;

            const pCollector = reply.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 2 * 60_000,
              filter: i => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
            });
            cm.set("permissions", pCollector);
            pCollector.on("collect", async i => {
              page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
              await i.update({
                embeds: [buildPermsEmbed(user, pages[page], page, pages.length, colorRol)],
                components: [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)],
              });
            });
            pCollector.on("end", async () => reply.edit({ components: [makeSelectRow(selectId, true, baseOptions)] }).catch(() => {}));
          }
        });

        collector.on("end", async () => {
          cm.stopAll();
          await reply.edit({ components: [] }).catch(() => {});
        });

      } catch (err) {
        log.error("Error en user info", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener la información del usuario");
      }
    },
  })

  // ══════════════════════════════════════════
  // user avatar
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({ name: "avatar", description: "Muestra el avatar de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        const input   = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const guild   = ctx.guild;
        let user, member;

        if (guild) {
          member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");
          user = member.user;
        } else {
          user = await resolveUser(ctx, input);
          if (!user) return ctx.send("No pude encontrar al usuario");
          member = null;
        }

        const avatarOpts   = { extension: "png", size: 4096 };
        const serverAvatar = member ? member.displayAvatarURL(avatarOpts) : user.displayAvatarURL(avatarOpts);
        const globalAvatar = user.displayAvatarURL(avatarOpts);
        const hasDistinct  = !!(member?.avatar && member.avatar !== user.avatar);
        const color        = member?.displayHexColor || "#ff383d";

        const buildEmbed = (type) => new EmbedBuilder()
          .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
          .setTitle(hasDistinct ? (type === "server" ? "Avatar del servidor" : "Avatar global") : "Avatar")
          .setURL(type === "server" ? serverAvatar : globalAvatar)
          .setImage(type === "server" ? serverAvatar : globalAvatar)
          .setColor(color).setTimestamp();

        const selectId  = uniqueId("avatar_select");
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
          filter: i => i.customId === selectId,
        });

        collector.on("collect", async interaction => {
          if (interaction.user.id !== invoker.id) {
            return interaction.reply({ embeds: [buildEmbed(interaction.values[0])], flags: MessageFlags.Ephemeral });
          }
          await interaction.update({ embeds: [buildEmbed(interaction.values[0])] });
        });

        collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
      } catch (err) {
        log.error("Error en user avatar", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener el avatar");
      }
    },
  })

  // ══════════════════════════════════════════
  // user banner
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({ name: "banner", description: "Muestra el banner de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        const input   = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        let user, member;

        if (ctx.guild) {
          member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");
          user   = await member.user.fetch().catch(() => member.user);
        } else {
          user   = await resolveUser(ctx, input);
          if (!user) return ctx.send("No pude encontrar al usuario");
          user   = await user.fetch().catch(() => user);
          member = null;
        }

        const serverBannerURL = member?.bannerURL?.({ size: 4096 }) ?? null;
        const globalBannerURL = user.bannerURL({ size: 4096 });
        if (!globalBannerURL && !serverBannerURL) return ctx.send("Este usuario no tiene banner");

        const hasDistinct = !!(serverBannerURL && serverBannerURL !== globalBannerURL);
        const color       = member?.displayHexColor || "#ff383d";

        const buildEmbed = (type) => {
          const isServer = type === "server";
          const url      = isServer ? serverBannerURL : globalBannerURL;
          return new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
            .setTitle(hasDistinct ? (isServer ? "Banner del servidor" : "Banner global") : "Banner")
            .setURL(url).setImage(url).setColor(color).setTimestamp();
        };

        const selectId  = uniqueId("banner_select");
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
          filter: i => i.customId === selectId,
        });

        collector.on("collect", async interaction => {
          if (interaction.user.id !== invoker.id) {
            return interaction.reply({ embeds: [buildEmbed(interaction.values[0])], flags: MessageFlags.Ephemeral });
          }
          await interaction.update({ embeds: [buildEmbed(interaction.values[0])] });
        });

        collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
      } catch (err) {
        log.error("Error en user banner", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener el banner");
      }
    },
  })

  // ══════════════════════════════════════════
  // user roles
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({ name: "roles", description: "Muestra los roles de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        if (!ctx.guild) return noGuildReply(ctx);
        const input   = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const member  = await resolveMember(ctx, input);
        if (!member) return ctx.send("No pude encontrar al usuario");

        const user     = member.user;
        const allRoles = member.roles.cache
          .filter(r => r.id !== ctx.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(r => `<@&${r.id}>`);

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
          filter: i => [prevId, nextId].includes(i.customId) && i.user.id === invoker.id,
        });

        collector.on("collect", async i => {
          page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
          await i.update({
            embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
            components: [buildPaginationRow(prevId, nextId, page, pages.length)],
          });
        });

        collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
      } catch (err) {
        log.error("Error en user roles", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener los roles");
      }
    },
  })

  // ══════════════════════════════════════════
  // user permissions
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({ name: "permissions", description: "Muestra los permisos de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        if (!ctx.guild) return noGuildReply(ctx);
        const input   = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const member  = await resolveMember(ctx, input);
        if (!member) return ctx.send("No pude encontrar al usuario");

        const user  = member.user;
        const color = member.displayHexColor || "#2b2d31";
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
          filter: i => [prevId, nextId].includes(i.customId) && i.user.id === invoker.id,
        });

        collector.on("collect", async i => {
          page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
          await i.update({
            embeds: [buildPermsEmbed(user, pages[page], page, pages.length, color)],
            components: [buildPaginationRow(prevId, nextId, page, pages.length)],
          });
        });

        collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
      } catch (err) {
        log.error("Error en user permissions", { err: err?.message ?? String(err) });
        await ctx.send("No se pudieron obtener los permisos del usuario");
      }
    },
  }),
};

module.exports = { data };
