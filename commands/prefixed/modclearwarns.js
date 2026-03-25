const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "clearwarns",
    description: "Borra todas las advertencias de un usuario",
    aliases: ["warnsclear", "clearwarn"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Clearwarns", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nBorra las advertencias de un usuario` +
            `\n\n**Aliases:**\n\`warnsclear\`, \`clearwarn\`` +
            `\n\n\`\`\`js\n.clearwarns <@usuario>\nEjemplo: .clearwarns @loge\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
