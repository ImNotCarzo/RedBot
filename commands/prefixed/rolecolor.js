const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "color",
    description: "Muestra el color de un rol",
    aliases: ["colorrole", "rolecolor"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Color", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nMuestra el color de un rol` +
            `\n\n**Aliases:**\n\`colorrole\`, \`rolecolor\`` +
            `\n\n\`\`\`js\n.color <@rol>\nEjemplo: .color @gokiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
