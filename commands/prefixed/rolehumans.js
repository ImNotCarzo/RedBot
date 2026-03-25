const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "rolehumans",
    description: "Añade o quita un rol a todos los usuarios (sin bots)",
    aliases: ["humansrole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Rolehumans", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nAñade o quita un rol a todos los usuarios` +
              `\n\n**Aliases:**\n\`humansrole\`` +
              `\n\n\`\`\`js\n.rolehumans <@rol> <add|remove>\nEjemplo: .rolehumans @miembro add\`\`\``
            )
            .setColor(RED),
        ],
      });
    },
};

module.exports = { data };
