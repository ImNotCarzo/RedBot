const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "rename",
    description: "Renombra un canal",
    aliases: ["chrename", "channelrename"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Rename", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nRenombra un canal` +
            `\n\n**Aliases:**\n\`chrename\`, \`channelrename\`` +
            `\n\n\`\`\`js\n.rename [#canal] <nuevo>\nEjemplo: .rename #uxiono padalustro\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
