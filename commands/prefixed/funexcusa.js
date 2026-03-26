const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "excusa",
    description: "Genera una excusa ridícula pero creativa",
    aliases: ["coartada", "excuse"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const bot = ctx.bot.user;
    const usageEmbed = new EmbedBuilder()
      .setAuthor({ name: "Comando Excusa", iconURL: bot.displayAvatarURL() })
      .setDescription(
        `**Usos:**\nGenera una excusa ridícula pero creativa` +
        `\n\n**Aliases:**\n\`coartada\`, \`excuse\`` +
        `\n\n\`\`\`js\n.excusa [situacion]\nEjemplo: .excusa llegué tarde\`\`\``
      )
      .setColor(RED);

    return ctx.send({ embeds: [usageEmbed] });
  },
};

module.exports = { data };
