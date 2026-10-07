const { GroupBuilder, CommandBuilder } = require("gralonium");
const {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const { createCommandLogger, clampPage, noGuildReply, buildPagRow, uniqueId, handleCommandError } = require("../_shared/runtime");
const { RED } = require("../../utils/colors");

const VERIFICATION_LEVELS = { 0: "Ninguno", 1: "Bajo", 2: "Medio", 3: "Alto", 4: "Muy alto" };
const log = createCommandLogger("CMD_SERVER");

function getServerView(guild, selected) {
  if (selected === "logo") {
    if (!guild.iconURL()) return { error: "Este servidor no tiene logo" };
    const url = guild.iconURL({ size: 4096, extension: "png" });
    return {
      embed: new EmbedBuilder()
        .setTitle(`Logo de ${guild.name}`)
        .setURL(url)
        .setImage(url)
        .setColor(RED)
        .setTimestamp(),
    };
  }
  if (selected === "banner") {
    const bannerURL = guild.bannerURL({ size: 4096, extension: "png" });
    if (!bannerURL) return { error: "Este servidor no tiene banner" };
    return {
      embed: new EmbedBuilder()
        .setTitle(`Banner de ${guild.name}`)
        .setURL(bannerURL)
        .setImage(bannerURL)
        .setColor(RED)
        .setTimestamp(),
    };
  }
  if (selected === "emojis") {
    const emojis = guild.emojis.cache.map((e) => e.toString());
    if (!emojis.length) return { error: "Este servidor no tiene emojis" };
    const desc = emojis.reduce((acc, cur) => (acc.length + cur.length + 1 > 4000 ? acc : acc + (acc ? " " : "") + cur), "");
    return {
      embed: new EmbedBuilder()
        .setTitle(`Emojis de ${guild.name} (${emojis.length})`)
        .setDescription(desc)
        .setColor(RED)
        .setTimestamp(),
    };
  }
  return null;
}

const data = {
  data: new GroupBuilder({
    name: "server",
    description: "Comandos de información del servidor",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })

  // ══════════════════════════════════════════
  // server info
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "info",
      description: "Muestra información del servidor",
    }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const owner = await guild.fetchOwner().catch(() => null);
        const createdTs = Math.floor(guild.createdTimestamp / 1000);
        const roleCount = guild.roles.cache.filter((r) => r.id !== guild.id).size;

        const infoEmbed = new EmbedBuilder()
          .setTitle(guild.name)
          .setThumbnail(guild.iconURL({ size: 1024, extension: "png" }))
          .setColor(RED)
          .addFields(
            {
              name: "General",
              value:
                `> **ID:** \`${guild.id}\`\n` +
                `> **Dueño:** ${owner ? owner.user.username : "No disponible"}\n` +
                `> **Creación:** <t:${createdTs}:F> (<t:${createdTs}:R>)\n` +
                (guild.vanityURLCode ? `> **Tag:** \`${guild.vanityURLCode}\`\n` : ""),
            },
            {
              name: "Estadísticas",
              value:
                `> **Miembros:** \`${guild.memberCount}\`\n` +
                `> **Canales:** \`${guild.channels.cache.size}\`\n` +
                `> **Roles:** \`${roleCount}\`\n` +
                `> **Emojis:** \`${guild.emojis.cache.size}\`\n` +
                `> **Boost:** \`${guild.premiumSubscriptionCount} (Nivel ${guild.premiumTier})\``,
            },
            {
              name: "Seguridad",
              value: `> **Verificación:** \`${VERIFICATION_LEVELS[guild.verificationLevel] ?? guild.verificationLevel}\``,
            }
          )
          .setTimestamp();

        const baseOptions = [
          { label: "Logo", value: "logo", description: "Logo del servidor" },
          ...(guild.banner ? [{ label: "Banner", value: "banner", description: "Banner del servidor" }] : []),
          { label: "Roles", value: "roles", description: "Roles del servidor" },
          { label: "Emojis", value: "emojis", description: "Emojis del servidor" },
        ];
        const allOptions = [{ label: "Info", value: "info", description: "Información del servidor" }, ...baseOptions];

        const selectId = uniqueId("srv_select");
        const prevId = uniqueId("srv_prev");
        const nextId = uniqueId("srv_next");

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
        const authorId = ctx.user?.id ?? ctx.author?.id;
        let rolesPageCollector = null;

        const collector = reply.createMessageComponentCollector({
          time: 5 * 60 * 1000,
          filter: (i) => i.customId === selectId || [prevId, nextId].includes(i.customId),
        });

        collector.on("collect", async (interaction) => {
          const isAuthor = interaction.user.id === authorId;

          // Botones de paginación de roles
          if ([prevId, nextId].includes(interaction.customId)) {
            if (!isAuthor) return interaction.reply({ content: "No puedes interactuar con esto", flags: MessageFlags.Ephemeral });
            return;
          }

          const selected = interaction.values?.[0];
          if (!selected) return;

          if (rolesPageCollector) {
            rolesPageCollector.stop();
            rolesPageCollector = null;
          }

          if (selected === "info") {
            if (!isAuthor) return interaction.reply({ embeds: [infoEmbed], flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [infoEmbed], components: [buildSelectRow(false)] });
          }

          const view = getServerView(guild, selected);
          if (view) {
            if (view.error) return interaction.reply({ content: view.error, flags: MessageFlags.Ephemeral });
            if (!isAuthor) return interaction.reply({ embeds: [view.embed], flags: MessageFlags.Ephemeral });
            return interaction.update({ embeds: [view.embed], components: [buildSelectRow(true)] });
          }

          if (selected === "roles") {
            const roles = guild.roles.cache
              .filter((r) => r.id !== guild.id)
              .sort((a, b) => b.position - a.position)
              .map((r) => `<@&${r.id}>`);

            if (!roles.length) return interaction.reply({ content: "Este servidor no tiene roles", flags: MessageFlags.Ephemeral });

            const pages = [];
            for (let i = 0; i < roles.length; i += 15) pages.push(roles.slice(i, i + 15));
            let page = 0;

            const buildRolesEmbed = () =>
              new EmbedBuilder()
                .setTitle(`Roles de ${guild.name} (${page + 1}/${pages.length})`)
                .setDescription(pages[page].map((r, i) => `${page * 15 + i + 1}. ${r}`).join("\n"))
                .setColor(RED)
                .setFooter({ text: `${roles.length} roles en total` })
                .setTimestamp();

            if (!isAuthor) {
              return interaction.reply({
                embeds: [buildRolesEmbed()],
                flags: MessageFlags.Ephemeral,
              });
            }

            await interaction.update({
              embeds: [buildRolesEmbed()],
              components: pages.length > 1 ? [buildSelectRow(true), buildPagRow(prevId, nextId, page, pages.length)] : [buildSelectRow(true)],
            });

            if (pages.length <= 1) return;

            rolesPageCollector = reply.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 2 * 60 * 1000,
              filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
            });

            rolesPageCollector.on("collect", async (i) => {
              if (i.customId === prevId) page--;
              if (i.customId === nextId) page++;
              page = clampPage(page, pages.length);
              await i.update({
                embeds: [buildRolesEmbed()],
                components: [buildSelectRow(true), buildPagRow(prevId, nextId, page, pages.length)],
              });
            });

            rolesPageCollector.on("end", async () => {
              await reply.edit({ components: [buildSelectRow(true)] }).catch(() => {});
            });
          }
        });

        collector.on("end", async () => {
          if (rolesPageCollector) rolesPageCollector.stop();
          await reply.edit({ components: [] }).catch(() => {});
        });
      } catch (err) {
        log.error("Error en server info", { err: err?.message ?? String(err) });
        return handleCommandError(ctx, err);
      }
    },
  })

  // ══════════════════════════════════════════
  // server logo
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "logo",
      description: "Muestra el logo del servidor",
    }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);
        if (!guild.iconURL()) return ctx.send("Este servidor no tiene logo");

        const url = guild.iconURL({ size: 4096, extension: "png" });
        const embed = new EmbedBuilder()
          .setTitle(`Logo de ${guild.name}`)
          .setURL(url)
          .setImage(url)
          .setColor(RED)
          .setTimestamp();

        await ctx.send({ embeds: [embed] });
      } catch (err) {
        log.error("Error en server logo", { err: err?.message ?? String(err) });
        return handleCommandError(ctx, err);
      }
    },
  })

  // ══════════════════════════════════════════
  // server banner
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "banner",
      description: "Muestra el banner del servidor",
    }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);
        const bannerURL = guild.bannerURL({ size: 4096, extension: "png" });
        if (!bannerURL) return ctx.send("Este servidor no tiene banner");

        const embed = new EmbedBuilder()
          .setTitle(`Banner de ${guild.name}`)
          .setURL(bannerURL)
          .setImage(bannerURL)
          .setColor(RED)
          .setTimestamp();

        await ctx.send({ embeds: [embed] });
      } catch (err) {
        log.error("Error en server banner", { err: err?.message ?? String(err) });
        return handleCommandError(ctx, err);
      }
    },
  })

  // ══════════════════════════════════════════
  // server emojis
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "emojis",
      description: "Muestra todos los emojis del servidor",
    }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const emojis = guild.emojis.cache.map((e) => e.toString());
        if (!emojis.length) return ctx.send("Este servidor no tiene emojis");

        const embed = new EmbedBuilder()
          .setTitle(`Emojis de ${guild.name} (${emojis.length})`)
          .setDescription(emojis.reduce((acc, cur) => (acc.length + cur.length + 1 > 4000 ? acc : acc + (acc ? " " : "") + cur), ""))
          .setColor(RED)
          .setTimestamp();

        await ctx.send({ embeds: [embed] });
      } catch (err) {
        log.error("Error en server emojis", { err: err?.message ?? String(err) });
        return handleCommandError(ctx, err);
      }
    },
  })

  // ══════════════════════════════════════════
  // server roles
  // ══════════════════════════════════════════
  .addCommand({
    data: new CommandBuilder({
      name: "roles",
      description: "Lista los roles del servidor",
    }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const roles = guild.roles.cache
          .filter((r) => r.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map((r) => `<@&${r.id}>`);

        if (!roles.length) return ctx.send("No hay roles");

        const pages = [];
        for (let i = 0; i < roles.length; i += 15) pages.push(roles.slice(i, i + 15));
        let page = 0;

        const authorId = ctx.user?.id ?? ctx.author?.id;
        const prevId = uniqueId("srv_roles_prev");
        const nextId = uniqueId("srv_roles_next");

        const buildEmbed = () =>
          new EmbedBuilder()
            .setTitle(`Roles de ${guild.name} (${page + 1}/${pages.length})`)
            .setDescription(pages[page].map((r, i) => `${page * 15 + i + 1}. ${r}`).join("\n"))
            .setColor(RED)
            .setFooter({ text: `${roles.length} roles en total` })
            .setTimestamp();

        const reply = await ctx.send({
          embeds: [buildEmbed()],
          components: pages.length > 1 ? [buildPagRow(prevId, nextId, page, pages.length)] : [],
        });

        if (pages.length <= 1) return;

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60 * 1000,
          filter: (i) => [prevId, nextId].includes(i.customId),
        });

        collector.on("collect", async (interaction) => {
          if (interaction.user.id !== authorId) {
            return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
          }
          if (interaction.customId === prevId) page--;
          if (interaction.customId === nextId) page++;
          page = clampPage(page, pages.length);
          await interaction.update({ embeds: [buildEmbed()], components: [buildPagRow(prevId, nextId, page, pages.length)] });
        });

        collector.on("end", async () => {
          await reply.edit({ components: [] }).catch(() => {});
        });
      } catch (err) {
        log.error("Error en server roles", { err: err?.message ?? String(err) });
        return handleCommandError(ctx, err);
      }
    },
  }),
};

module.exports = { data };
