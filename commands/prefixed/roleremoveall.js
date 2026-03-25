const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { GREEN, RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "roleremoveall",
    description: "Quita un rol a todos los miembros que lo tengan",
    aliases: ["removeroleall", "removeallrole", "rremoveall"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Roleremoveall", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nQuita un rol a todos los miembros que lo tengan` +
              `\n\n**Aliases:**\n\`removeroleall\`, \`removeallrole\`` +
              `\n\n\`\`\`js\n.roleremoveall <@rol> [bots]\nEjemplo: .roleremoveall @miembro\`\`\``
            )
            .setColor(RED),
        ],
      });
    },
};

module.exports = { data };
