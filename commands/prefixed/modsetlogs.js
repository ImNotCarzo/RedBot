const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "setlogs",
    description: "Establece el canal de logs para RedBot en el servidor",
    aliases: ["modsetlogs", "logchannel", "setlog"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Setlogs", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nEstablece el canal de logs para RedBot en el servidor` +
            `\n\n**Aliases:**\n\`modsetlogs\`, \`logchannel\`, \`setlog\`` +
            `\n\n\`\`\`js\n.setlogs <#canal>\nEjemplo: .setlogs #uxiono\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
