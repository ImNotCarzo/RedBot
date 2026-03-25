const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "rolerename",
    description: "Renombra un rol",
    aliases: ["renamerole", "rrename"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Rolerename", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nRenombra un rol` +
            `\n\n**Aliases:**\n\`renamerole\`, \`rrename\`` +
            `\n\n\`\`\`js\n.rolerename <@rol> <nuevoNombre>\nEjemplo: .rolerename @gokiano potatiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
