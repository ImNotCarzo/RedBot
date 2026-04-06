const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "roleremove",
    description: "Quita un rol a un usuario",
    aliases: ["removerole", "rremove"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Roleremove", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nQuita un rol a un usuario` +
            `\n\n**Aliases:**\n\`removerole\`, \`rremove\`` +
            `\n\n\`\`\`js\n.roleremove <@usuario> <@rol>\nEjemplo: .roleremove @loge @gokiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
