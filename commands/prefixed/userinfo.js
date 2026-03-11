const { CommandBuilder } = require("erine");
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

function buildRolesEmbed(member, user, usernameDisplay, roles, page, totalPages) {
  return new EmbedBuilder()
    .setAuthor({ name: usernameDisplay, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(roles.join("\n"))
    .setColor(member.displayHexColor || "#2b2d31")
    .setFooter({ text: `Página ${page + 1}/${totalPages} • ${member.roles.cache.size - 1} roles en total` })
    .setTimestamp();
}

const data = {
  data: new CommandBuilder({
    name: "user",
    description: "Muestra información de un usuario",
    aliases: ["userinfo", "ui", "whois"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const input = ctx.args?.join(" ").trim() || null;
      const invoker = ctx.author;
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

      const selectId = `user_info_${Date.now()}`;
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

      const buildPaginationRow = (p, total) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
          new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(p === total - 1)
        );

      const reply = await ctx.send({ embeds: [infoEmbed], components: [buildSelectRow(false)] });

      const collector = reply.createMessageComponentCollector({
        time: 5 * 60 * 1000,
        filter: (i) => i.customId === selectId || [prevId, nextId].includes(i.customId),
      });

      collector.on("collect", async (interaction) => {
        const isAuthor = interaction.user.id === invoker.id;

        // Botones de paginación de roles
        if ([prevId, nextId].includes(interaction.customId)) {
          if (!isAuthor) return interaction.reply({ content: "No podés interactuar con esto", flags: MessageFlags.Ephemeral });
          return; // manejado en rolesCollector
        }

        const selected = interaction.values?.[0];
        if (!selected) return;

        if (!isAuthor) {
          if (selected === "avatar") {
            const avatarURL = member.displayAvatarURL({ extension: "png", size: 4096 });
            return interaction.reply({
              embeds: [new EmbedBuilder().setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) }).setTitle("Avatar").setURL(avatarURL).setImage(avatarURL).setColor(colorRol).setTimestamp()],
              flags: MessageFlags.Ephemeral,
            });
          }
          if (selected === "banner") {
            const bannerURL = user.bannerURL({ size: 4096 });
            if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
            return interaction.reply({
              embeds: [new EmbedBuilder().setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) }).setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp()],
              flags: MessageFlags.Ephemeral,
            });
          }
          if (selected === "roles") {
            const roles = member.roles.cache.filter((r) => r.id !== ctx.guild.id).sort((a, b) => b.position - a.position).map((r) => `<@&${r.id}>`);
            if (!roles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
            return interaction.reply({
              embeds: [new EmbedBuilder().setAuthor({ name: usernameDisplay, iconURL: user.displayAvatarURL({ size: 128 }) }).setDescription(roles.join(", ")).setColor(colorRol).setTimestamp()],
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({ content: "No podés interactuar con esto", flags: MessageFlags.Ephemeral });
        }

        if (selected === "info") return interaction.update({ embeds: [infoEmbed], components: [buildSelectRow(false)] });

        if (selected === "avatar") {
          const avatarOpts = { extension: "png", size: 4096 };
          const serverAvatar = member.displayAvatarURL(avatarOpts);
          const globalAvatar = user.displayAvatarURL(avatarOpts);
          const hasDistinctAvatar = member.avatar && member.avatar !== user.avatar;
          const buildAvatarEmbed = (type) => new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
            .setTitle(type === "server" ? "Avatar del servidor" : "Avatar global")
            .setURL(type === "server" ? serverAvatar : globalAvatar)
            .setImage(type === "server" ? serverAvatar : globalAvatar)
            .setColor(colorRol).setTimestamp();

          if (hasDistinctAvatar) {
            const avSelectId = `av_type_${Date.now()}`;
            const avSelectRow = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder().setCustomId(avSelectId).setPlaceholder("Tipo de avatar...")
                .addOptions(
                  new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setValue("server").setDescription("Avatar de servidor"),
                  new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setValue("global").setDescription("Avatar global"),
                )
            );
            await interaction.update({ embeds: [buildAvatarEmbed("server")], components: [buildSelectRow(true), avSelectRow] });
            const avCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60_000, filter: (i) => i.customId === avSelectId && i.user.id === invoker.id });
            avCollector.on("collect", async (i) => await i.update({ embeds: [buildAvatarEmbed(i.values[0])], components: [buildSelectRow(true), avSelectRow] }));
          } else {
            await interaction.update({ embeds: [buildAvatarEmbed("server")], components: [buildSelectRow(true)] });
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
          const allRoles = member.roles.cache.filter((r) => r.id !== ctx.guild.id).sort((a, b) => b.position - a.position).map((r) => `<@&${r.id}>`);
          if (!allRoles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
          const pages = [];
          for (let i = 0; i < allRoles.length; i += 15) pages.push(allRoles.slice(i, i + 15));
          let page = 0;

          await interaction.update({
            embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)],
            components: pages.length > 1 ? [buildSelectRow(true), buildPaginationRow(page, pages.length)] : [buildSelectRow(true)],
          });

          if (pages.length <= 1) return;

          const rolesCollector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60 * 1000,
            filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === invoker.id,
          });

          rolesCollector.on("collect", async (i) => {
            if (i.customId === prevId) page--;
            if (i.customId === nextId) page++;
            await i.update({
              embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)],
              components: [buildSelectRow(true), buildPaginationRow(page, pages.length)],
            });
          });

          rolesCollector.on("end", async () => {
            await reply.edit({ components: [buildSelectRow(true)] }).catch(() => {});
          });
        }
      });

      collector.on("end", async () => {
        await reply.edit({ components: [] }).catch(() => {});
      });

    } catch (err) {
      console.error("Error en user:", err);
      await ctx.send("No se pudo obtener la información del usuario");
    }
  },
};

module.exports = { data };