const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "roleicon",
    description: "Muestra el icono de un rol",
    aliases: ["iconrole", "ricon"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Roleicon", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nMuestra el icono de un rol` +
            `\n\n**Aliases:**\n\`iconrole\`, \`ricon\`` +
            `\n\n\`\`\`js\n.roleicon <@rol>\nEjemplo: .roleicon @gokiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
