const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "purge",
    description: "Elimina mensajes del canal",
    aliases: ["modpurge", "clear", "prune"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const bot = ctx.bot.user;
    const usageEmbed = new EmbedBuilder()
      .setAuthor({ name: "Comando Purge", iconURL: bot.displayAvatarURL() })
      .setDescription(
        `**Usos:**\nElimina mensajes del canal` +
        `\n\n**Aliases:**\n\`modpurge\`, \`clear\`, \`prune\`` +
        `\n\n\`\`\`js\n.purge <cantidad> [@usuario]\nEjemplo: .purge 10 @carzo\`\`\``
      )
      .setColor(RED);

    return ctx.send({ embeds: [usageEmbed] });
  },
};

module.exports = { data };
