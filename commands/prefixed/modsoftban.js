const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "softban",
    description: "Expulsa a un usuario borrando sus mensajes (ban + unban inmediato)",
    aliases: ["modsoftban", "sban"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Softban", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nExpulsa a un usuario del servidor borrando sus mensajes` +
            `\n\n**Aliases:**\n\`modsoftban\`, \`sban\`` +
            `\n\n\`\`\`js\n.softban <@usuario> /razonOpcional/\nEjemplo: .softban @loge chau\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
