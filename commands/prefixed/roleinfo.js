const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "role",
    description: "Muestra información de un rol",
    aliases: ["roleinfo", "inforole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Roleinfo", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nMuestra información de un rol` +
            `\n\n**Aliases:**\n\`roleinfo\`, \`inforole\`` +
            `\n\n\`\`\`js\n.roleinfo <@rol>\nEjemplo: .roleinfo @gokiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
