const { CommandBuilder } = require("erine");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "roles",
    description: "Lista los roles del servidor",
    aliases: ["serverroles"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => `<@&${r.id}>`);

      if (!roles.length) return ctx.send("Este servidor no tiene roles");

      const pages = [];
      for (let i = 0; i < roles.length; i += 15) pages.push(roles.slice(i, i + 15));
      let page = 0;

      const authorId = ctx.author.id;
      const prevId = `srv_roles_prev_${Date.now()}`;
      const nextId = `srv_roles_next_${Date.now()}`;

      const buildEmbed = () => new EmbedBuilder()
        .setTitle(`Roles de ${guild.name}`)
        .setDescription(pages[page].map((r, i) => `${page * 15 + i + 1}. ${r}`).join("\n"))
        .setColor("#ff383d")
        .setFooter({ text: `Página ${page + 1}/${pages.length} • ${roles.length} roles en total` })
        .setTimestamp();

      const buildRow = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page === pages.length - 1)
      );

      const reply = await ctx.send({
        embeds: [buildEmbed()],
        components: pages.length > 1 ? [buildRow()] : [],
      });

      if (pages.length <= 1) return;

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60 * 1000,
        filter: (i) => [prevId, nextId].includes(i.customId),
      });

      collector.on("collect", async (interaction) => {
        if (interaction.user.id !== authorId) {
          return interaction.reply({ content: "No podés interactuar con esto", flags: MessageFlags.Ephemeral });
        }
        if (interaction.customId === prevId) page--;
        if (interaction.customId === nextId) page++;
        await interaction.update({ embeds: [buildEmbed()], components: [buildRow()] });
      });

      collector.on("end", async () => {
        await reply.edit({ components: [] }).catch(() => {});
      });

    } catch (err) {
      console.error("Error en roles:", err);
      await ctx.send("No se pudo obtener los roles");
    }
  },
};

module.exports = { data };