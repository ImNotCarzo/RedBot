const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "tempban",
    description: "Banea a un usuario temporalmente",
    aliases: ["modtempban", "tban"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Tempban", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nBanea a un usuario temporalmente` +
            `\n\n**Aliases:**\n\`modtempban\`, \`tban\`` +
            `\n\n\`\`\`js\n.tempban <@usuario> <tiempo> /razonOpcional/\nEjemplo: .tempban @loge 10d chau\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
