const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "ban",
    description: "Banea a un usuario del servidor",
    aliases: ["modban"],
    as_prefix: true,
    as_slash: false,
  }),
  async code(ctx) {
    const bot = ctx.bot.user;
    const embed = new EmbedBuilder()
      .setAuthor({ name: "Comando Ban", iconURL: bot.displayAvatarURL() })
      .setDescription(
        `**Usos:**\nBanea a un usuario del servidor` +
        `\n\n**Aliases:**\n\`modban\`` +
        `\n\n\`\`\`js\n.ban <@usuario> /razonOpcional/\nEjemplo: .ban @loge chau\`\`\``
      )
      .setColor(RED);
    return ctx.send({ embeds: [embed] });
  },
};

module.exports = { data };
