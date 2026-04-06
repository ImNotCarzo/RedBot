const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "critica",
    description: "Te doy una crítica despiadada de algo",
    aliases: ["criticar", "criticize"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    return ctx.send({
      embeds: [
        new EmbedBuilder()
          .setAuthor({
            name: "Comando Critica",
            iconURL: ctx.bot.user.displayAvatarURL(),
          })
          .setDescription(
            `**Usos:**\nGenera una crítica despiadada de algo` +
              `\n\n**Aliases:**\n\`criticar\`, \`criticize\`` +
              `\n\n\`\`\`js\n.critica <tema>\nEjemplo: .critica la chochoinflación\`\`\``
          )
          .setColor(RED),
      ],
    });
  },
};

module.exports = { data };
