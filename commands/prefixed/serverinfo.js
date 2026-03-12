const { CommandBuilder } = require("erine");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");

const VERIFICATION_LEVELS = { 0: "Ninguno", 1: "Bajo", 2: "Medio", 3: "Alto", 4: "Muy alto" };
const COLOR = "#ff383d";

function buildPagRow(prevId, nextId, page, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page === total - 1)
  );
}

const data = {
  data: new CommandBuilder({
    name: "server",
    description: "Muestra información del servidor",
    aliases: ["sv"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const owner = await guild.fetchOwner().catch(() => null);
      const createdTs = Math.floor(guild.createdTimestamp / 1000);
      const roleCount = guild.roles.cache.filter((r) => r.id !== guild.id).size;

      const infoEmbed = new EmbedBuilder()
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ size: 1024, extension: "png" }))
        .setColor(COLOR)
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

      const selectId = `server_select_${Date.now()}`;
      const prevId = `srv_prev_${Date.now()}`;
      const nextId = `srv_next_${Date.now()}`;
      const authorId = ctx.author.id;

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
      let rolesPageCollector = null;

      const collector = reply.createMessageComponentCollector({
        time: 5 * 60 * 1000,
        filter: (i) => i.customId === selectId || [prevId, nextId].includes(i.customId),
      });

      collector.on("collect", async (interaction) => {
        const isAuthor = interaction.user.id === authorId;

        if ([prevId, nextId].includes(interaction.customId)) {
          if (!isAuthor) return interaction.reply({ content: "No puedes interactuar con esto", flags: MessageFlags.Ephemeral });
          return;
        }

        const selected = interaction.values?.[0];
        if (!selected) return;

        if (rolesPageCollector) { rolesPageCollector.stop(); rolesPageCollector = null; }

        // ── Usuarios ajenos ──
        if (!isAuthor) {
          if (selected === "logo") {
            if (!guild.iconURL()) return interaction.reply({ content: "Este servidor no tiene logo", flags: MessageFlags.Ephemeral });
            return interaction.reply({
              embeds: [new EmbedBuilder().setTitle(`Logo de ${guild.name}`).setURL(guild.iconURL({ size: 4096, extension: "png" })).setImage(guild.iconURL({ size: 4096, extension: "png" })).setColor(COLOR).setTimestamp()],
              flags: MessageFlags.Ephemeral,
            });
          }
          if (selected === "banner") {
            if (!guild.banner) return interaction.reply({ content: "Este servidor no tiene banner", flags: MessageFlags.Ephemeral });
            return interaction.reply({
              embeds: [new EmbedBuilder().setTitle(`Banner de ${guild.name}`).setImage(guild.bannerURL({ size: 4096 })).setColor(COLOR).setTimestamp()],
              flags: MessageFlags.Ephemeral,
            });
          }
          if (selected === "emojis") {
            const emojis = guild.emojis.cache.map((e) => e.toString());
            if (!emojis.length) return interaction.reply({ content: "Este servidor no tiene emojis", flags: MessageFlags.Ephemeral });
            return interaction.reply({
              embeds: [new EmbedBuilder().setTitle(`Emojis de ${guild.name} (${emojis.length})`).setDescription(emojis.join(" ")).setColor(COLOR).setTimestamp()],
              flags: MessageFlags.Ephemeral,
            });
          }
          if (selected === "roles") {
            const roles = guild.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => `<@&${r.id}>`);
            if (!roles.length) return interaction.reply({ content: "Este servidor no tiene roles", flags: MessageFlags.Ephemeral });
            return interaction.reply({
              embeds: [new EmbedBuilder().setTitle(`Roles de ${guild.name}`).setDescription(roles.slice(0, 15).join("\n")).setColor(COLOR).setFooter({ text: `${roles.length} roles en total` }).setTimestamp()],
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({ content: "No puedes interactuar con esto", flags: MessageFlags.Ephemeral });
        }

        // ── Autor ──
        if (selected === "info") return interaction.update({ embeds: [infoEmbed], components: [buildSelectRow(false)] });

        if (selected === "logo") {
          if (!guild.iconURL()) return interaction.reply({ content: "Este servidor no tiene logo", flags: MessageFlags.Ephemeral });
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle(`Logo de ${guild.name}`).setURL(guild.iconURL({ size: 4096, extension: "png" })).setImage(guild.iconURL({ size: 4096, extension: "png" })).setColor(COLOR).setTimestamp()],
            components: [buildSelectRow(true)],
          });
        }

        if (selected === "banner") {
          if (!guild.banner) return interaction.reply({ content: "Este servidor no tiene banner", flags: MessageFlags.Ephemeral });
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle(`Banner de ${guild.name}`).setImage(guild.bannerURL({ size: 4096 })).setColor(COLOR).setTimestamp()],
            components: [buildSelectRow(true)],
          });
        }

        if (selected === "emojis") {
          const emojis = guild.emojis.cache.map((e) => e.toString());
          if (!emojis.length) return interaction.reply({ content: "Este servidor no tiene emojis", flags: MessageFlags.Ephemeral });
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle(`Emojis de ${guild.name} (${emojis.length})`).setDescription(emojis.join(" ")).setColor(COLOR).setTimestamp()],
            components: [buildSelectRow(true)],
          });
        }

        if (selected === "roles") {
          const roles = guild.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => `<@&${r.id}>`);
          if (!roles.length) return interaction.reply({ content: "Este servidor no tiene roles", flags: MessageFlags.Ephemeral });

          const pages = [];
          for (let i = 0; i < roles.length; i += 15) pages.push(roles.slice(i, i + 15));
          let page = 0;

          const buildRolesEmbed = () => new EmbedBuilder()
            .setTitle(`Roles de ${guild.name}`)
            .setDescription(pages[page].map((r, i) => `${page * 15 + i + 1}. ${r}`).join("\n"))
            .setColor(COLOR)
            .setFooter({ text: `Página ${page + 1}/${pages.length} • ${roles.length} roles en total` })
            .setTimestamp();

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
      console.error("Error en server:", err);
      await ctx.send("No se pudo obtener la información del servidor");
    }
  },
};

module.exports = { data };