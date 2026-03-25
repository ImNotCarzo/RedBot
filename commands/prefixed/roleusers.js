const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "roleusers",
    description: "Lista usuarios con un rol",
    aliases: ["rusers", "usersrole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Roleusers", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nLista de usuarios con un rol` +
            `\n\n**Aliases:**\n\`rusers\`, \`usersrole\`` +
            `\n\n\`\`\`js\n.roleusers <@rol>\nEjemplo: .roleusers @gokiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      },
};

module.exports = { data };
