const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const COLOR = "#ff383d";

const data = {
  data: new CommandBuilder({
    name: "teoria",
    description: "Una teoría conspirativa sobre cualquier cosa",
    aliases: ["conspira", "conspiracion", "theory"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Teoria", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nGenera una teoría conspirativa sobre cualquier cosa` +
              `\n\n**Aliases:**\n\`conspira\`, \`conspiracion\`, \`theory\`` +
              `\n\n\`\`\`js\n.teoria <tema>\nEjemplo: .teoria las palomas son drones\`\`\``
            )
            .setColor(COLOR),
        ],
      });
    },
};

module.exports = { data };
