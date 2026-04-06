const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "rolebots",
    description: "Añade o quita un rol a todos los bots",
    aliases: ["botsrole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Rolebots", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nAñade o quita un rol a todos los bots` +
              `\n\n**Aliases:**\n\`botsrole\`` +
              `\n\n\`\`\`js\n.rolebots <@rol> <add|remove>\nEjemplo: .rolebots @bots add\`\`\``
            )
            .setColor(RED),
        ],
      });
    },
};

module.exports = { data };
