const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "ubanner",
    description: "Muestra el banner de un usuario",
    aliases: ["userbanner"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const bot = ctx.bot.user;
    const usageEmbed = new EmbedBuilder()
      .setAuthor({ name: "Comando Ubanner", iconURL: bot.displayAvatarURL() })
      .setDescription(
        `**Usos:**\nMuestra el banner de un usuario` +
        `\n\n**Aliases:**\n\`userbanner\`` +
        `\n\n\`\`\`js\n.ubanner [@usuario]\nEjemplo: .ubanner @carzo\`\`\``
      )
      .setColor(RED);

    return ctx.send({ embeds: [usageEmbed] });
  },
};

module.exports = { data };
