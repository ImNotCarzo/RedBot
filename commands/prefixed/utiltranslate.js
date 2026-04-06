const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const COLOR = "#ff383d";

const data = {
  data: new CommandBuilder({
    name: "translate",
    description: "Traduce texto a otro idioma",
    aliases: ["traducir", "trans"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Translate", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nTraduce texto a cualquier idioma` +
              `\n\n**Aliases:**\n\`traducir\`, \`trans\`` +
              `\n\n\`\`\`js\n.translate <texto> [idioma]\nEjemplo: .translate כלב español\`\`\``
            )
            .setColor(COLOR),
        ], allowedMentions: { repliedUser: false },
      });
    },
};

module.exports = { data };
