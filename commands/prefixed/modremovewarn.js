const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "removewarn",
    description: "Elimina una advertencia por su ID",
    aliases: ["delwarn", "warnremove"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Removewarn", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nElimina una advertencia por su ID` +
            `\n\n**Aliases:**\n\`delwarn\`, \`warnremove\`` +
            `\n\n\`\`\`js\n.removewarn <ID>\nEjemplo: .removewarn 3lp3p3\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
