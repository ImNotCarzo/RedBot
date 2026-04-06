const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "warnings",
    description: "Muestra las advertencias de un usuario",
    aliases: ["warns", "modwarnings"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Warnings", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nMuestra las advertencias de un usuario` +
            `\n\n**Aliases:**\n\`warns\`, \`modwarnings\`` +
            `\n\n\`\`\`js\n.warnings <@usuario>\nEjemplo: .warnings @loge\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
