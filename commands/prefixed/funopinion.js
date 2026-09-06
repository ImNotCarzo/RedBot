const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const COLOR = "#ff383d";

const data = {
  data: new CommandBuilder({
    name: "opinion",
    description: "Pide mi opinión sin filtro sobre algo",
    aliases: ["op", "opina"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Opinion", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nPide mi opinión sin filtro sobre algo` +
              `\n\n**Aliases:**\n\`op\`, \`opina\`` +
              `\n\n\`\`\`js\n.opinion <tema>\nEjemplo: .opinion la chochoinflación\`\`\``
            )
            .setColor(COLOR),
        ],
      });
    },
};

module.exports = { data };
