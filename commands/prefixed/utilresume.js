const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "resume",
    description: "Resume un texto largo",
    aliases: ["resumir", "summarize"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Resume", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nResume un texto de 100 caracteres o más` +
              `\n\n**Aliases:**\n\`resumir\`, \`summarize\`` +
              `\n\n\`\`\`js\n.resume <texto>\nEjemplo: .resume en terminos de reproducción entre hombres humanos y Pokémon hembras, Vaporeon es el...\`\`\``
            )
            .setColor(RED),
        ],
      });
    },
};

module.exports = { data };
