const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "mute",
    description: "Silencia a un usuario",
    aliases: ["modmute", "timeout", "silenciar"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Mute", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nSilencia a un usuario del servidor` +
            `\n\n**Aliases:**\n\`modmute\`, \`timeout\`, \`silenciar\`` +
            `\n\n\`\`\`js\n.mute <@usuario> <tiempo> [razón]\nEjemplo: .mute @loge 30m shhh\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
  },
};

module.exports = { data };
