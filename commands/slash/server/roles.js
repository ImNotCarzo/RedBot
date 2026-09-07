const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, ComponentType, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, clampPage, noGuildReply, buildPagRow } = require("../../_shared/runtime");

const COLOR = RED;
const log = createCommandLogger("CMD_SERVER");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "roles",
      description: "Lista los roles del servidor",
    }),

    async code(ctx) {
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
        const prevId = `srv_roles_prev_${Date.now()}`;
        const nextId = `srv_roles_next_${Date.now()}`;

        const buildEmbed = () =>
          new EmbedBuilder()
            .setTitle(`Roles de ${guild.name} (${page + 1}/${pages.length})`)
            .setDescription(pages[page].map((r, i) => `${page * 15 + i + 1}. ${r}`).join("\n"))
            .setColor(COLOR)
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
        await ctx.send("No se pudo obtener los roles");
      }
    },
  },
};
