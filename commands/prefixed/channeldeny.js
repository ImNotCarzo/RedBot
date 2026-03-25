const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "deny",
    description: "Quita el acceso a un usuario en un canal",
    aliases: ["chdeny", "channeldeny"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Deny", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nQuita el acceso a un usuario en un canal` +
            `\n\n**Aliases:**\n\`chdeny\`, \`channeldeny\`` +
            `\n\n\`\`\`js\n.deny <@usuario> [#canal]\nEjemplo: .deny @loge #uxiono\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
