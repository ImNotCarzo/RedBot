const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "roleadd",
    description: "Añade un rol a un usuario",
    aliases: ["addrole", "radd"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Roleadd", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nAñade un rol a un usuario` +
            `\n\n**Aliases:**\n\`addrole\`, \`radd\`` +
            `\n\n\`\`\`js\n.roleadd <@usuario> <@rol>\nEjemplo: .roleadd @loge @gokiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
