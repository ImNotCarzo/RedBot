const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "slowmode",
    description: "Establece el slowmode de un canal (0 para desactivar, máx 6h)",
    aliases: ["sm", "chslowmode", "channelslowmode"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Slowmode", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nEstablece un slowmode para el canal` +
            `\n\n**Aliases:**\n\`sm\`, \`chslowmode\`, \`channelslowmode\`` +
            `\n\n\`\`\`js\n.slowmode <tiempo> [#canal]\nEjemplo: .slowmode 1h #uxiono\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
