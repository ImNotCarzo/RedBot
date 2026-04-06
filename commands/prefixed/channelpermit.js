const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "permit",
    description: "Da acceso a un usuario en un canal",
    aliases: ["chpermit", "channelpermit"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Permit", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nDa acceso a un usuario en un canal` +
            `\n\n**Aliases:**\n\`chpermit\`, \`channelpermit\`` +
            `\n\n\`\`\`js\n.permit <@usuario> [#canal]\nEjemplo: .permit @loge #uxiono\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
