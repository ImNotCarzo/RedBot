const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "kick",
    description: "Expulsa a un usuario del servidor",
    aliases: ["modkick", "expulsar"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Kick", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nExpulsa a un usuario del servidor` +
            `\n\n**Aliases:**\n\`modkick\`, \`expulsar\`` +
            `\n\n\`\`\`js\n.kick <@usuario> /razonOpcional/\nEjemplo: .kick @loge chau\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
