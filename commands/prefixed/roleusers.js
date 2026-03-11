const { CommandBuilder } = require("erine");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "roleusers",
    description: "Lista usuarios con un rol",
    aliases: ["rusers", "usersrole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const role = ctx.message?.mentions?.roles?.first() ||
        (ctx.args?.[0] ? guild.roles.cache.get(ctx.args[0]) || guild.roles.cache.find(r => r.name.toLowerCase().includes(ctx.args.join(" ").toLowerCase())) : null);

      if (!role) return ctx.send("Mencioná o especificá un rol");

      const members = role.members.map(m => m.toString());
      if (!members.length) return ctx.send("Nadie tiene este rol");

      const pages = [];
      for (let i = 0; i < members.length; i += 15) pages.push(members.slice(i, i + 15));
      let page = 0;

      const authorId = ctx.author.id;
      const prevId = `role_users_prev_${Date.now()}`;
      const nextId = `role_users_next_${Date.now()}`;

      const buildEmbed = () => new EmbedBuilder()
        .setTitle(`Usuarios con ${role.name}`)
        .setDescription(pages[page].join("\n"))
        .setColor(role.color || "#2b2d31")
        .setFooter({ text: `Página ${page + 1}/${pages.length} • ${members.length} usuarios en total` })
        .setTimestamp();

      const buildRow = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page === pages.length - 1)
      );

      const msg = await ctx.send({
        embeds: [buildEmbed()],
        components: pages.length > 1 ? [buildRow()] : [],
      });

      if (pages.length <= 1) return;

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60 * 1000,
        filter: (i) => [prevId, nextId].includes(i.customId),
      });

      collector.on("collect", async (i) => {
        if (i.user.id !== authorId) return i.reply({ content: "No podés interactuar con esto", flags: MessageFlags.Ephemeral });
        if (i.customId === prevId) page--;
        if (i.customId === nextId) page++;
        await i.update({ embeds: [buildEmbed()], components: [buildRow()] });
      });

      collector.on("end", async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });

    } catch (err) {
      console.error("Error en roleusers:", err);
      await ctx.send("No se pudo obtener los usuarios del rol");
    }
  },
};

module.exports = { data };