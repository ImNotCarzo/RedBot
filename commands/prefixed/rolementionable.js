const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "rolementionable",
    description: "Activa o desactiva si un rol es mencionable por todos",
    aliases: ["rolemention", "mentionrole", "rmention"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Rolementionable", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nActiva o desactiva si el rol es mencionable por todos` +
            `\n\n**Aliases:**\n\`rolemention\`, \`mentionrole\`, \`rmention\`` +
            `\n\n\`\`\`js\n.rolementionable <@rol>\nEjemplo: .rolementionable @gokiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
