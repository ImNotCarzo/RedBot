const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "unmute",
    description: "Quita el timeout a un usuario",
    aliases: ["modunmute", "untimeout"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Unmute", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nQuita el mute a un usuario` +
            `\n\n**Aliases:**\n\`modunmute\`, \`untimeout\`` +
            `\n\n\`\`\`js\n.unmute <@usuario> [razón]\nEjemplo: .unmute @loge hola\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
