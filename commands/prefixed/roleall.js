const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "roleall",
    description: "Añade un rol a todos los miembros del servidor",
    aliases: ["allrole", "rall"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Roleall", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nAñade un rol a todos los miembros` +
              `\n\n**Aliases:**\n\`allrole\`` +
              `\n\n\`\`\`js\n.roleall <@rol> [bots]\nEjemplo: .roleall @miembro\nEjemplo con bots: .roleall @miembro bots\`\`\``
            )
            .setColor(RED),
        ],
      });
    },
};

module.exports = { data };
