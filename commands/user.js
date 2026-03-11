const { CommandBuilder, GroupBuilder, ParamsBuilder } = require("erine");
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  PermissionFlagBits,
} = require("discord.js");

const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";

function noGuildReply(ctx) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Invítame")
      .setStyle(ButtonStyle.Link)
      .setURL(INVITE_URL)
  );
  return ctx.send({
    embeds: [
      new EmbedBuilder()
        .setDescription("No estoy en este servidor")
        .setColor("#ff383d")
    ],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function resolveMember(ctx, input) {
  if (!input) return ctx.member ?? null;
  if (typeof input === "object") return input;
  if (ctx.message?.mentions?.members?.size) return ctx.message.mentions.members.first();
  if (/^\d{17,20}$/.test(input)) {
    const byId = await ctx.guild.members.fetch(input).catch(() => null);
    if (byId) return byId;
  }
  const results = await ctx.guild.members.fetch({ query: input, limit: 1 }).catch(() => null);
  if (results?.size) return results.first();
  const lower = input.toLowerCase();
  return ctx.guild.members.cache.find((m) => {
    const username = m.user.username?.toLowerCase() ?? "";
    const globalName = m.user.globalName?.toLowerCase() ?? "";
    const nickname = m.nickname?.toLowerCase() ?? "";
    return username.includes(lower) || globalName.includes(lower) || nickname.includes(lower);
  }) ?? null;
}

// Resuelve un usuario sin necesidad de guild
async function resolveUser(ctx, input) {
  const invoker = ctx.user ?? ctx.author;
  if (!input) return invoker ?? null;
  if (typeof input === "object") return input.user ?? input;
  const id = String(input).replace(/\D/g, "");
  if (id) return ctx.bot.users.fetch(id).catch(() => null);
  return null;
}

function buildRolesEmbed(member, user, usernameDisplay, roles, page, totalPages) {
  return new EmbedBuilder()
    .setAuthor({ name: usernameDisplay, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(roles.join("\n"))
    .setColor(member.displayHexColor || "#2b2d31")
    .setFooter({ text: `Página ${page + 1}/${totalPages} • ${member.roles.cache.size - 1} roles en total` })
    .setTimestamp();
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
    data: new CommandBuilder({
      name: "info",
      description: "Muestra información general de un usuario",
    }),
    params: new ParamsBuilder().addMember({
      name: "usuario",
      description: "Menciona a alguien",
      required: false,
    }),

    async code(ctx) {
      try {
        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const guild = ctx.guild;

        // ── Sin guild: info básica del usuario ──
        if (!guild) {
          const user = await resolveUser(ctx, input);
          if (!user) return ctx.send("No se encontró ningún usuario");
          const fetched = await user.fetch().catch(() => user);
          const createdTs = Math.floor(fetched.createdTimestamp / 1000);
          const insignias = fetched.flags?.toArray().map((f) => `\`${f}\``).join(", ") || "Sin insignias";

          const embed = new EmbedBuilder()
            .setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) })
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
            .setFooter({ text: `Solicitado por ${invoker.username}` })
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
                .addOptions(
                  (includeInfo ? allOptions : baseOptions).map((o) =>
                    new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description)
                  )
                )
            );

          const reply = await ctx.send({ embeds: [embed], components: [buildSelectRow(false)] });

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 5 * 60 * 1000,
            filter: (i) => i.customId === selectId,
          });

          collector.on("collect", async (interaction) => {
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

          collector.on("end", async () => {
            await reply.edit({ components: [] }).catch(() => {});
          });

          return;
        }

        // ── Con guild: info completa ──
        const member = await resolveMember(ctx, input);
        if (!member) return ctx.send("No se encontró ningún usuario");

        const user = await member.user.fetch().catch(() => member.user);
        const insignias = user.flags?.toArray().map((f) => `\`${f}\``).join(", ") || "Sin insignias";
        const colorRol = member.displayHexColor || "#2b2d31";
        const createdTs = Math.floor(user.createdTimestamp / 1000);
        const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
        const usernameDisplay = member.nickname ? `${user.username} (${member.nickname})` : user.username;
        const hasBanner = !!user.banner;

        const infoEmbed = new EmbedBuilder()
          .setAuthor({ name: usernameDisplay, iconURL: user.displayAvatarURL({ size: 1024 }) })
          .setThumbnail(user.displayAvatarURL({ size: 1024 }))
          .setColor(colorRol)
          .addFields(
            {
              name: "General",
              value:
                `> **ID:** \`${user.id}\`\n` +
                `> **Nombre:** ${usernameDisplay}\n` +
                `> **Color del rol:** \`${colorRol}\`\n` +
                `> **Insignias:** ${insignias}\n` +
                `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
            },
            {
              name: "Servidor",
              value: `> **Ingreso:** ${joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "No disponible"}`,
            }
          )
          .setFooter({ text: `Solicitado por ${invoker.username}` })
          .setTimestamp();

        const baseOptions = [
          { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
          ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
          { label: "Roles", value: "roles", description: "Roles del usuario" },
        ];
        const allOptions = [{ label: "Info", value: "info", description: "Información del usuario" }, ...baseOptions];

        const selectId = `user_info_select_${Date.now()}`;
        const prevId = `roles_prev_${Date.now()}`;
        const nextId = `roles_next_${Date.now()}`;

        const buildSelectRow = (includeInfo) =>
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(selectId)
              .setPlaceholder("Navegar...")
              .addOptions(
                (includeInfo ? allOptions : baseOptions).map((o) =>
                  new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description)
                )
              )
          );

        const reply = await ctx.send({ embeds: [infoEmbed], components: [buildSelectRow(false)] });
        const authorId = invoker.id;
        let rolesCollector = null;

        const collector = reply.createMessageComponentCollector({
          time: 5 * 60 * 1000,
          filter: (i) => i.customId === selectId || [prevId, nextId].includes(i.customId),
        });

        collector.on("collect", async (interaction) => {
          const isAuthor = interaction.user.id === authorId;

          if ([prevId, nextId].includes(interaction.customId)) {
            if (!isAuthor) return interaction.reply({ content: "No podés interactuar con esto", flags: MessageFlags.Ephemeral });
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
              const roles = member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => `<@&${r.id}>`);
              if (!roles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
              const embed = new EmbedBuilder().setAuthor({ name: usernameDisplay, iconURL: user.displayAvatarURL({ size: 128 }) }).setDescription(roles.join(", ")).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ content: "No podés interactuar con esto", flags: MessageFlags.Ephemeral });
          }

          if (selected === "info") return interaction.update({ embeds: [infoEmbed], components: [buildSelectRow(false)] });

          if (selected === "avatar") {
            const avatarOpts = { extension: "png", size: 4096 };
            const serverAvatar = member.displayAvatarURL(avatarOpts);
            const globalAvatar = user.displayAvatarURL(avatarOpts);
            const hasDistinct = member.avatar && member.avatar !== user.avatar;

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
              const avCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60_000, filter: (i) => i.customId === avSelectId && i.user.id === authorId });
              avCollector.on("collect", async (i) => await i.update({ embeds: [buildAv(i.values[0])], components: [buildSelectRow(true), avRow] }));
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
            const allRoles = member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => `<@&${r.id}>`);
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
              filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
            });

            rolesCollector.on("collect", async (i) => {
              if (i.customId === prevId) page--;
              if (i.customId === nextId) page++;
              await i.update({ embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)], components: [buildSelectRow(true), buildPaginationRow(prevId, nextId, page, pages.length)] });
            });

            rolesCollector.on("end", async () => {
              await reply.edit({ components: [buildSelectRow(true)] }).catch(() => {});
            });
          }
        });

        collector.on("end", async () => {
          if (rolesCollector) rolesCollector.stop();
          await reply.edit({ components: [] }).catch(() => {});
        });

      } catch (err) {
        console.error("Error en user info:", err);
        await ctx.send("No se pudo obtener la información del usuario");
      }
    },
  })

  // ══════════════════════════════════════════
  // user avatar
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "avatar",
      description: "Muestra el avatar de un usuario",
    }),
    params: new ParamsBuilder().addMember({
      name: "usuario",
      description: "Menciona a alguien",
      required: false,
    }),

    async code(ctx) {
      try {
        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const guild = ctx.guild;

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

        const avatarOpts = { extension: "png", size: 4096 };
        const serverAvatar = member ? member.displayAvatarURL(avatarOpts) : user.displayAvatarURL(avatarOpts);
        const globalAvatar = user.displayAvatarURL(avatarOpts);
        const hasDistinct = member?.avatar && member.avatar !== user.avatar;
        const color = member?.displayHexColor || "#ff383d";

        const buildEmbed = (type) => {
          const isServer = type === "server";
          return new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
            .setTitle(hasDistinct ? (isServer ? "Avatar del servidor" : "Avatar global") : "Avatar")
            .setURL(isServer ? serverAvatar : globalAvatar)
            .setImage(isServer ? serverAvatar : globalAvatar)
            .setColor(color)
            .setTimestamp();
        };

        const selectId = `avatar_select_${Date.now()}`;
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

        collector.on("end", async () => {
          await reply.edit({ components: [] }).catch(() => {});
        });

      } catch (err) {
        console.error("Error en user avatar:", err);
        await ctx.send("No se pudo obtener el avatar");
      }
    },
  })

  // ══════════════════════════════════════════
  // user banner
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "banner",
      description: "Muestra el banner de un usuario",
    }),
    params: new ParamsBuilder().addMember({
      name: "usuario",
      description: "Menciona a alguien",
      required: false,
    }),

    async code(ctx) {
      try {
        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const guild = ctx.guild;

        let user, member;

        if (guild) {
          member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");
          user = await member.user.fetch().catch(() => member.user);
        } else {
          user = await resolveUser(ctx, input);
          if (!user) return ctx.send("No pude encontrar al usuario");
          user = await user.fetch().catch(() => user);
          member = null;
        }

        const serverBannerURL = member?.bannerURL?.({ size: 4096 }) ?? null;
        const globalBannerURL = user.bannerURL({ size: 4096 });

        if (!globalBannerURL && !serverBannerURL) return ctx.send("Este usuario no tiene banner");

        const hasDistinct = serverBannerURL && serverBannerURL !== globalBannerURL;
        const color = member?.displayHexColor || "#ff383d";

        const buildEmbed = (type) => {
          const isServer = type === "server";
          const url = isServer ? serverBannerURL : globalBannerURL;
          return new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
            .setTitle(hasDistinct ? (isServer ? "Banner del servidor" : "Banner global") : "Banner")
            .setURL(url)
            .setImage(url)
            .setColor(color)
            .setTimestamp();
        };

        const selectId = `banner_select_${Date.now()}`;
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

        collector.on("end", async () => {
          await reply.edit({ components: [] }).catch(() => {});
        });

      } catch (err) {
        console.error("Error en user banner:", err);
        await ctx.send("No se pudo obtener el banner");
      }
    },
  })

  // ══════════════════════════════════════════
  // user roles
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "roles",
      description: "Muestra los roles de un usuario",
    }),
    params: new ParamsBuilder().addMember({
      name: "usuario",
      description: "Menciona a alguien",
      required: false,
    }),

    async code(ctx) {
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const member = await resolveMember(ctx, input);
        if (!member) return ctx.send("No pude encontrar al usuario");

        const user = member.user;
        const usernameDisplay = member.nickname ? `${user.username} (${member.nickname})` : user.username;

        const allRoles = member.roles.cache
          .filter((r) => r.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map((r) => `<@&${r.id}>`);

        if (!allRoles.length) return ctx.send("Este usuario no tiene roles");

        const pages = [];
        for (let i = 0; i < allRoles.length; i += 15) pages.push(allRoles.slice(i, i + 15));
        let page = 0;

        const prevId = `roles_prev_${Date.now()}`;
        const nextId = `roles_next_${Date.now()}`;

        const reply = await ctx.send({
          embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)],
          components: pages.length > 1 ? [buildPaginationRow(prevId, nextId, page, pages.length)] : [],
        });

        if (pages.length <= 1) return;

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60 * 1000,
          filter: (i) => [prevId, nextId].includes(i.customId),
        });

        collector.on("collect", async (i) => {
          if (i.user.id !== invoker.id) return i.reply({ content: "No podés interactuar con esto", flags: MessageFlags.Ephemeral });
          if (i.customId === prevId) page--;
          if (i.customId === nextId) page++;
          await i.update({
            embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)],
            components: [buildPaginationRow(prevId, nextId, page, pages.length)],
          });
        });

        collector.on("end", async () => {
          await reply.edit({ components: [] }).catch(() => {});
        });

      } catch (err) {
        console.error("Error en user roles:", err);
        await ctx.send("No se pudo obtener los roles");
      }
    },
  })
 // ══════════════════════════════════════════
  // user permissions
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "permissions",
      description: "Muestra los permisos de un usuario",
    }),
    params: new ParamsBuilder().addMember({
      name: "usuario",
      description: "Menciona a alguien",
      required: false,
    }),

    async code(ctx) {
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const input = ctx.get("usuario") ?? null;
        const member = await resolveMember(ctx, input);
        if (!member) return ctx.send("No pude encontrar al usuario");

        const user = member.user;
        const usernameDisplay = member.nickname
          ? `${user.username} (${member.nickname})`
          : user.username;

        const perms = member.permissions
          .toArray()
          .sort()
          .map(p =>
            p
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, s => s.toUpperCase())
          );

        if (!perms.length) return ctx.send("Este usuario no tiene permisos");

        const embed = new EmbedBuilder()
          .setTitle(`Permisos de ${usernameDisplay}`)
          .setDescription(perms.join("\n"))
          .setColor(member.displayHexColor || "#2b2d31")
          .setTimestamp();

        await ctx.send({ embeds: [embed] });

      } catch (err) {
        console.error("Error en user permissions:", err);
        await ctx.send("No se pudieron obtener los permisos del usuario");
      }
    },
  }),
};

module.exports = { data };