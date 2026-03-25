const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const RED  = "#ff383d";

const data = {
  data: new CommandBuilder({
    name: "transcribe",
    description: "Transcribe un audio o video a texto",
    aliases: ["transcribir"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Transcribe", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nTranscribe un audio o video a texto` +
              `\n\n**Aliases:**\n\`transcribir\`` +
              `\n\n\`\`\`js\n.transcribe <url | adjunto>\nEjemplo: .transcribe https://ejemplo.com/audio.mp3\`\`\``
            )
            .setColor(RED),
        ],
      });
    },
};

module.exports = { data };
