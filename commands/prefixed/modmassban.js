const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "massban",
    description: "Banea a múltiples usuarios a la vez (hasta 5 menciones o IDs)",
    aliases: ["modmassban", "mban"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Massban", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nBanea a múltiples usuarios a la vez (hasta 5)` +
            `\n\n**Aliases:**\n\`modmassban\`, \`mban\`` +
            `\n\n\`\`\`js\n.massban <@usuario1> <@usuario2> ... /razonOpcional/\nEjemplo: .massban @loge @otro chau\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
