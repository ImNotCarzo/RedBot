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
const { resolveMemberFlexible } = require("../utils/helpers");

const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";
const log = createCommandLogger("CMD_USER");

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

function buildPaginationRow(prevId, nextId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
  );
}

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

        if (!guild) {
          const user    = await resolveUser(ctx, input);
          if (!user) return ctx.send("No se encontró ningún usuario");
          const fetched = await user.fetch().catch(() => user);
          const createdTs = Math.floor(fetched.createdTimestamp / 1000);
          const insignias = fetched.flags?.toArray().map(f => `\`${f}\``).join(", ") || "Sin insignias";

          const embed = new EmbedBuilder()
            .setThumbnail(fetched.displayAvatarURL({ size: 1024 }))
            .setColor("#ff383d")
            .addFields({
              name: "General",
              value:
                `> **ID:** \`${fetched.id}\`\n` +
                `> **Nombre:** ${fetched.username}\n` +
                `> **Insignias:** ${insignias}\n` +
                `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
            })
            .setTimestamp();

          const hasBanner = !!fetched.banner;
          const baseOptions = [
            { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
            ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
          ];
          const allOptions = [{ label: "Info", value: "info", description: "Información del usuario" }, ...baseOptions];
          const selectId = `user_info_select_${Date.now()}`;

          const buildSelectRow = (includeInfo) =>
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(selectId)
                .setPlaceholder("Navegar...")
                .addOptions((includeInfo ? allOptions : baseOptions).map(o =>
                  new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description)
                ))
            );

          const reply = await ctx.send({ embeds: [embed], components: [buildSelectRow(false)] });
          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 5 * 60 * 1000,
            filter: i => i.customId === selectId,
          });

          collector.on("collect", async interaction => {
            const selected = interaction.values[0];
            const isAuthor = interaction.user.id === invoker.id;
            if (selected === "info") {
              if (!isAuthor) return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [embed], components: [buildSelectRow(false)] });
            }
            if (selected === "avatar") {
              const url = fetched.displayAvatarURL({ size: 4096, extension: "png" });
              const av = new EmbedBuilder().setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) }).setTitle("Avatar").setURL(url).setImage(url).setColor("#ff383d").setTimestamp();
              if (!isAuthor) return interaction.reply({ embeds: [av], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [av], components: [buildSelectRow(true)] });
            }
            if (selected === "banner") {
              const bannerURL = fetched.bannerURL({ size: 4096 });
              if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
              const bn = new EmbedBuilder().setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) }).setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor("#ff383d").setTimestamp();
              if (!isAuthor) return interaction.reply({ embeds: [bn], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [bn], components: [buildSelectRow(true)] });
            }
          });

          collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
          return;
        }

        const member = await resolveMember(ctx, input);
        if (!member) return ctx.send("No se encontró ningún usuario");

        const user      = await member.user.fetch().catch(() => member.user);
        const insignias = user.flags?.toArray().map(f => `\`${f}\``).join(", ") || "Sin insignias";
        const colorRol  = member.displayHexColor || "#2b2d31";
        const createdTs = Math.floor(user.createdTimestamp / 1000);
        const joinedTs  = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
        const usernameDisplay = user.username;
        const hasBanner = !!user.banner;

        const infoEmbed = new EmbedBuilder()
          .setThumbnail(user.displayAvatarURL({ size: 1024 }))
          .setColor(colorRol)
          .addFields(
            {
              name: "General",
              value:
                `> **ID:** \`${user.id}\`\n` +
                `> **Nombre:** ${user.username}\n` +
                `> **Color del rol:** \`${colorRol}\`\n` +
                `> **Insignias:** ${insignias}\n` +
                `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
            },
            {
              name: "Servidor",
              value: `> **Apodo:** ${member.nickname ?? "Sin apodo"}\n> **Ingreso:** ${joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "No disponible"}`,
            }
          )
          .setTimestamp();

        const baseOptions = [
          { label: "Avatar",     value: "avatar",      description: "Avatar del usuario" },
          ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
          { label: "Roles",      value: "roles",       description: "Roles del usuario" },
          { label: "Permisos",   value: "permissions", description: "Permisos del usuario" },
        ];
        const allOptions = [{ label: "Info", value: "info", description: "Información del usuario" }, ...baseOptions];
        const selectId = `user_info_select_${Date.now()}`;
        const prevId   = `roles_prev_${Date.now()}`;
        const nextId   = `roles_next_${Date.now()}`;

        const buildSelectRow = (includeInfo) =>
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(selectId)
              .setPlaceholder("Navegar...")
              .addOptions((includeInfo ? allOptions : baseOptions).map(o =>
                new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description)
              ))
          );

        const reply    = await ctx.send({ embeds: [infoEmbed], components: [buildSelectRow(false)] });
        const authorId = invoker.id;
        let rolesCollector = null;

        const collector = reply.createMessageComponentCollector({
          time: 5 * 60 * 1000,
          filter: i => i.customId === selectId || [prevId, nextId].includes(i.customId),
        });

        collector.on("collect", async interaction => {
          const isAuthor = interaction.user.id === authorId;

          if ([prevId, nextId].includes(interaction.customId)) {
            if (!isAuthor) return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
            return;
          }

          const selected = interaction.values?.[0];
          if (!selected) return;
          if (rolesCollector) { rolesCollector.stop(); rolesCollector = null; }

          if (!isAuthor) {
            if (selected === "avatar") {
              const url = member.displayAvatarURL({ extension: "png", size: 4096 });
              const av = new EmbedBuilder().setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) }).setTitle("Avatar").setURL(url).setImage(url).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [av], flags: MessageFlags.Ephemeral });
            }
            if (selected === "banner") {
              const bannerURL = user.bannerURL({ size: 4096 });
              if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
              const bn = new EmbedBuilder().setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) }).setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [bn], flags: MessageFlags.Ephemeral });
            }
            if (selected === "roles") {
              const roles = member.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r, i) => `${i + 1}. <@&${r.id}>`);
              if (!roles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
              const embed = new EmbedBuilder().setAuthor({ name: usernameDisplay, iconURL: user.displayAvatarURL({ size: 128 }) }).setDescription(roles.join("\n")).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            if (selected === "permissions") {
              const perms = member.permissions.toArray().sort().map(p => `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}\``);
              if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });
              const embed = new EmbedBuilder().setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) }).setTitle(user.username).setDescription(perms.join("\n")).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
          }

          if (selected === "info") return interaction.update({ embeds: [infoEmbed], components: [buildSelectRow(false)] });

          if (selected === "avatar") {
            const avatarOpts = { extension: "png", size: 4096 };
            const serverAvatar = member.displayAvatarURL(avatarOpts);
            const globalAvatar = user.displayAvatarURL(avatarOpts);
            const hasDistinct  = member.avatar && member.avatar !== user.avatar;
            const buildAv = (type) => new EmbedBuilder()
              .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
              .setTitle(type === "server" ? "Avatar del servidor" : "Avatar global")
              .setURL(type === "server" ? serverAvatar : globalAvatar)
              .setImage(type === "server" ? serverAvatar : globalAvatar)
              .setColor(colorRol).setTimestamp();
            if (hasDistinct) {
              const avSelectId = `user_av_${Date.now()}`;
              const avRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(avSelectId).setPlaceholder("Tipo de avatar...")
                  .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setValue("server").setDescription("Avatar de servidor"),
                    new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setValue("global").setDescription("Avatar global"),
                  )
              );
              await interaction.update({ embeds: [buildAv("server")], components: [buildSelectRow(true), avRow] });
              const avCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60_000, filter: i => i.customId === avSelectId && i.user.id === authorId });
              avCollector.on("collect", async i => i.update({ embeds: [buildAv(i.values[0])], components: [buildSelectRow(true), avRow] }));
            } else {
              await interaction.update({ embeds: [buildAv("server")], components: [buildSelectRow(true)] });
            }
            return;
          }

          if (selected === "banner") {
            const bannerURL = user.bannerURL({ size: 4096 });
            if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
            return interaction.update({
              embeds: [new EmbedBuilder().setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) }).setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp()],
              components: [buildSelectRow(true)],
            });
          }

          if (selected === "roles") {
            const allRoles = member.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).map(r => `<@&${r.id}>`);
            if (!allRoles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
            const pages = [];
            for (let i = 0; i < allRoles.length; i += 15) pages.push(allRoles.slice(i, i + 15));
            let page = 0;
            await interaction.update({
              embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)],
              components: pages.length > 1 ? [buildSelectRow(true), buildPaginationRow(prevId, nextId, page, pages.length)] : [buildSelectRow(true)],
            });
            if (pages.length <= 1) return;
            rolesCollector = reply.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 2 * 60 * 1000,
              filter: i => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
            });
            rolesCollector.on("collect", async i => {
              if (i.customId === prevId) page--;
              if (i.customId === nextId) page++;
              page = clampPage(page, pages.length);
              await i.update({ embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)], components: [buildSelectRow(true), buildPaginationRow(prevId, nextId, page, pages.length)] });
            });
            rolesCollector.on("end", async () => reply.edit({ components: [buildSelectRow(true)] }).catch(() => {}));
            return;
          }

          if (selected === "permissions") {
            const perms = member.permissions.toArray().sort().map(p => `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}\``);
            if (!perms.length) return interaction.reply({ content: "Este usuario no tiene permisos", flags: MessageFlags.Ephemeral });
            const pages = [];
            for (let i = 0; i < perms.length; i += 15) pages.push(perms.slice(i, i + 15));
            let page = 0;
            const pPrevId = `perms_prev_${Date.now()}`;
            const pNextId = `perms_next_${Date.now()}`;
            const buildPermsEmbed = (pg) => new EmbedBuilder()
              .setAuthor({ 
                name: `Permisos de ${user.username}`,
                iconURL: user.displayAvatarURL({ size: 128 })
              })
              .setDescription(pages[pg].join("\n"))
              .setColor(colorRol)
              .setTimestamp();
            await interaction.update({
              embeds: [buildPermsEmbed(page)],
              components: pages.length > 1 ? [buildSelectRow(true), buildPaginationRow(pPrevId, pNextId, page, pages.length)] : [buildSelectRow(true)],
            });
            if (pages.length <= 1) return;
            const permsCollector = reply.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 2 * 60 * 1000,
              filter: i => [pPrevId, pNextId].includes(i.customId) && i.user.id === authorId,
            });
            permsCollector.on("collect", async i => {
              if (i.customId === pPrevId) page--;
              if (i.customId === pNextId) page++;
              page = clampPage(page, pages.length);
              await i.update({ embeds: [buildPermsEmbed(page)], components: [buildSelectRow(true), buildPaginationRow(pPrevId, pNextId, page, pages.length)] });
            });
            permsCollector.on("end", async () => reply.edit({ components: [buildSelectRow(true)] }).catch(() => {}));
          }
        });

        collector.on("end", async () => {
          if (rolesCollector) rolesCollector.stop();
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
        const hasDistinct  = member?.avatar && member.avatar !== user.avatar;
        const color        = member?.displayHexColor || "#ff383d";
        const buildEmbed   = (type) => new EmbedBuilder()
          .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
          .setTitle(hasDistinct ? (type === "server" ? "Avatar del servidor" : "Avatar global") : "Avatar")
          .setURL(type === "server" ? serverAvatar : globalAvatar)
          .setImage(type === "server" ? serverAvatar : globalAvatar)
          .setColor(color).setTimestamp();
        const selectId  = `avatar_select_${Date.now()}`;
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
        const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60_000, filter: i => i.customId === selectId });
        collector.on("collect", async interaction => {
          if (interaction.user.id !== invoker.id) return interaction.reply({ embeds: [buildEmbed(interaction.values[0])], flags: MessageFlags.Ephemeral });
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
        const hasDistinct = serverBannerURL && serverBannerURL !== globalBannerURL;
        const color       = member?.displayHexColor || "#ff383d";
        const buildEmbed  = (type) => {
          const isServer = type === "server";
          const url = isServer ? serverBannerURL : globalBannerURL;
          return new EmbedBuilder().setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) }).setTitle(hasDistinct ? (isServer ? "Banner del servidor" : "Banner global") : "Banner").setURL(url).setImage(url).setColor(color).setTimestamp();
        };
        const selectId  = `banner_select_${Date.now()}`;
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
        const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60_000, filter: i => i.customId === selectId });
        collector.on("collect", async interaction => {
          if (interaction.user.id !== invoker.id) return interaction.reply({ embeds: [buildEmbed(interaction.values[0])], flags: MessageFlags.Ephemeral });
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
        const user            = member.user;
        const usernameDisplay = user.username;
        const allRoles        = member.roles.cache
          .filter(r => r.id !== ctx.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(r => `<@&${r.id}>`);
        if (!allRoles.length) return ctx.send("Este usuario no tiene roles");
        const pages = [];
        for (let i = 0; i < allRoles.length; i += 15) pages.push(allRoles.slice(i, i + 15));
        let page = 0;
        const prevId = `roles_prev_${Date.now()}`;
        const nextId = `roles_next_${Date.now()}`;
        const reply  = await ctx.send({
          embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)],
          components: pages.length > 1 ? [buildPaginationRow(prevId, nextId, page, pages.length)] : [],
        });
        if (pages.length <= 1) return;
        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60 * 1000,
          filter: i => [prevId, nextId].includes(i.customId),
        });
        collector.on("collect", async i => {
          if (i.user.id !== invoker.id) return i.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
          if (i.customId === prevId) page--;
          if (i.customId === nextId) page++;
          page = clampPage(page, pages.length);
          await i.update({ embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)], components: [buildPaginationRow(prevId, nextId, page, pages.length)] });
        });
        collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
      } catch (err) {
        log.error("Error en user roles", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener los roles");
      }
    },
  })

  // ══════════════════════════════════════════
  // user perms
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
        const perms = member.permissions.toArray().sort().map(p =>
          `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}\``
        );
        if (!perms.length) return ctx.send("Este usuario no tiene permisos");
        const pages = [];
        for (let i = 0; i < perms.length; i += 15) pages.push(perms.slice(i, i + 15));
        let page = 0;
        const prevId = `perms_prev_${Date.now()}`;
        const nextId = `perms_next_${Date.now()}`;
        const buildEmbed = (pg) => new EmbedBuilder()
          .setAuthor({ 
            name: `Permisos de ${user.username}`, 
            iconURL: user.displayAvatarURL({ size: 128 })
          })
          .setDescription(pages[pg].join("\n"))
          .setColor(color)
          .setTimestamp();
        const reply = await ctx.send({
          embeds: [buildEmbed(page)],
          components: pages.length > 1 ? [buildPaginationRow(prevId, nextId, page, pages.length)] : [],
        });
        if (pages.length <= 1) return;
        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60 * 1000,
          filter: i => [prevId, nextId].includes(i.customId),
        });
        collector.on("collect", async i => {
          if (i.user.id !== invoker.id) return i.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
          if (i.customId === prevId) page--;
          if (i.customId === nextId) page++;
          page = clampPage(page, pages.length);
          await i.update({ embeds: [buildEmbed(page)], components: [buildPaginationRow(prevId, nextId, page, pages.length)] });
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
