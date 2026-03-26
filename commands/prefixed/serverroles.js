const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "roles",
    description: "Lista los roles del servidor",
    aliases: ["serverroles", "sroles"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const bot = ctx.bot.user;
    const usageEmbed = new EmbedBuilder()
      .setAuthor({ name: "Comando Roles", iconURL: bot.displayAvatarURL() })
      .setDescription(
        `**Usos:**\nLista los roles del servidor` +
        `\n\n**Aliases:**\n\`serverroles\`, \`sroles\`` +
        `\n\n\`\`\`js\n.roles\nEjemplo: .roles\`\`\``
      )
      .setColor(RED);

    return ctx.send({ embeds: [usageEmbed] });
  },
};

module.exports = { data };
