const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { sendThinkingReply, editThinkingReply } = require("../../utils/thinkingReply");

const BLUE = "#5865f2";
const RED  = "#ff383d";

const VALID_EXT = /\.(mp3|mp4|wav|ogg|webm|m4a|flac)$/i;

const data = {
  data: new CommandBuilder({
    name: "transcribe",
    description: "Transcribe un audio o video a texto",
    aliases: ["transcribir"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const urlArg  = ctx.args?.[0]?.trim();
    const adjunto = ctx.message?.attachments?.first();

    if (!urlArg && !adjunto) {
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
    }

    const fileUrl  = urlArg || adjunto.url;
    const fileName = adjunto?.name ?? fileUrl.split("/").pop().split("?")[0];

    if (adjunto && adjunto.size > 25 * 1024 * 1024)
      return ctx.send("El archivo no puede superar los 25MB");

    if (!VALID_EXT.test(fileName))
      return ctx.send("Formato no soportado. Usa: mp3, wav, ogg, webm, mp4, m4a, flac");

    try {
      const thinking = await sendThinkingReply(ctx);

      const { default: Groq } = require("groq-sdk");
      const groq = new Groq({ apiKey: process.env.GROQ });

      const fileRes = await fetch(fileUrl);
      const blob    = await fileRes.blob();
      const file    = new File([blob], fileName, { type: blob.type });

      const result = await groq.audio.transcriptions.create({
        file,
        model: "whisper-large-v3",
        response_format: "text",
      });

      const texto = result?.trim();

      if (!texto) {
        return editThinkingReply(thinking, { content: "No se detectó voz en el archivo" });
      }

      if (texto.length > 3900) {
        return editThinkingReply(thinking, {
          content: "La transcripción es muy larga, se envió como archivo:",
          files: [{ attachment: Buffer.from(texto, "utf-8"), name: "transcripcion.txt" }],
        });
      }

      await editThinkingReply(thinking, {
        content: "",
        embeds: [
          new EmbedBuilder()
            .setTitle("Transcripción")
            .setDescription(texto)
            .setColor(RED)
            .setFooter({ text: `${fileName} · ${adjunto ? `${(adjunto.size / 1024).toFixed(1)}KB` : "URL"}` })
            .setTimestamp(),
        ], allowedMentions: { repliedUser: false },
      });

    } catch (err) {
      console.error("[transcribe]", err);
      await ctx.send("No se pudo transcribir el archivo");
    }
  },
};

module.exports = { data };
