const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const COLOR = "#ff383d";

const data = {
  data: new CommandBuilder({
    name: "describe",
    description: "Describe el contenido de una imagen",
    aliases: ["describir"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Describe", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nDescribe el contenido de una imagen` +
              `\n\n**Aliases:**\n\`describir\`` +
              `\n\n\`\`\`js\n.describe <adjunto>\nEjemplo: .describe <Subeunaimagenwe.png> \`\`\``
            )
            .setColor(COLOR),
        ],
      });
    },
};

module.exports = { data };
