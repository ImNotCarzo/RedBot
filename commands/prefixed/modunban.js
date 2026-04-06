const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "unban",
    description: "Desbanea a un usuario por su ID",
    aliases: ["modunban", "desbanear"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
          const bot = ctx.bot.user;
          const paramerror = new EmbedBuilder()
            .setAuthor({ name: "Comando Unban", iconURL: bot.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nDesbanea a un usuario por su ID` +
              `\n\n**Aliases:**\n\`modunban\`, \`desbanear\`` +
              `\n\n\`\`\`js\n.unban <ID> [razón]\nEjemplo: .unban 1020772849906098186 hola\`\`\``
            )
            .setColor(RED);

          return ctx.send({ embeds: [paramerror] });
        },
};

module.exports = { data };
