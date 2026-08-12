const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "dmall",
    description: "Envía un DM con embed a todos los miembros del servidor",
    aliases: ["dm", "dmerveryone"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const bot = ctx.bot.user;

    const paramerror = new EmbedBuilder()
      .setAuthor({ name: "Comando DM All", iconURL: bot.displayAvatarURL() })
      .setDescription(
        `**Usos:**\nEnvía un embed por DM a todos los miembros del servidor` +
        `\n\n**Aliases:**\n\`dm\`, \`dmeveryone\`` +
        `\n\n\`\`\`js\n.dmall titulo,texto\nEjemplo: .dmall Hoy jugamos,Nos vemos a las 22hs\`\`\``
      )
      .setColor(RED);

    return ctx.send({ embeds: [paramerror] });
  },
};

module.exports = { data };
