const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "warn",
    description: "Advierte a un usuario",
    aliases: ["modwarn", "advertir"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Warn", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nAdvierte a un usuario` +
            `\n\n**Aliases:**\n\`modwarn\`, \`advertir\`` +
            `\n\n\`\`\`js\n.warn <@usuario> <razón>\nEjemplo: .warn @loge lol\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
