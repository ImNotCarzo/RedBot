const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { GREEN, RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "rolejoin",
    description: "Configura o desactiva el rol automático al entrar",
    aliases: ["joinrole", "autorole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
        return ctx.send({
          embeds: [
            new EmbedBuilder()
              .setAuthor({ name: "Comando Rolejoin", iconURL: ctx.bot.user.displayAvatarURL() })
              .setDescription(
                `**Usos:**\nConfigura o desactiva el rol automático al entrar` +
                `\n\n**Aliases:**\n\`joinrole\`, \`autorole\`` +
                `\n\n\`\`\`js\n.rolejoin <@rol>   → activar\n.rolejoin          → desactivar\`\`\``
              )
              .setColor(RED),
          ],
        });
      },
};

module.exports = { data };
