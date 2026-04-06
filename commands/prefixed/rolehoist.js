const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "rolehoist",
    description: "Activa o desactiva si un rol se muestra separado en la lista de miembros",
    aliases: ["hoistrole", "rhoist"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Rolehoist", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nActiva o desactiva si un rol se muestra separado en la lista de miembros` +
            `\n\n**Aliases:**\n\`hoistrole\`, \`rhoist\`` +
            `\n\n\`\`\`js\n.rolehoist <@rol>\nEjemplo: .rolehoist @gokiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
