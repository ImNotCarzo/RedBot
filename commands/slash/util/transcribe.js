const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, fetchWithTimeout, prepareReply } = require("../../_shared/runtime");

const log = createCommandLogger("CMD_UTIL");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "transcribe",
      description: "Transcribe un audio o video a texto",
    }),
    params: new ParamsBuilder().addAttachment({
      name: "archivo",
      description: "Audio a transcribir (mp3, wav, ogg, webm, mp4 — máx 25MB)",
      required: true,
    }),

    async code(ctx) {
      const reply = await prepareReply(ctx);
      const attachment = ctx.get("archivo");

      const VALID_EXT = /\.(mp3|mp4|wav|ogg|webm|m4a|flac)$/i;

      if (!VALID_EXT.test(attachment.name ?? "")) {
        return reply({ content: "Formato no soportado. Usa: mp3, wav, ogg, webm, mp4, m4a, flac", flags: MessageFlags.Ephemeral });
      }

      if (attachment.size > 25 * 1024 * 1024) {
        return reply({ content: "El archivo no puede superar los 25MB", flags: MessageFlags.Ephemeral });
      }

      try {
        const { default: Groq } = require("groq-sdk");
        const groq = new Groq({ apiKey: process.env.GROQ });

        const fileRes = await fetchWithTimeout(attachment.url, {}, 10_000);
        if (!fileRes.ok) throw new Error(`No se pudo descargar archivo (${fileRes.status})`);
        const blob = await fileRes.blob();
        const file = new File([blob], attachment.name ?? "audio.mp3", { type: blob.type });

        const result = await groq.audio.transcriptions.create({
          file,
          model: "whisper-large-v3",
          response_format: "text",
        });

        const texto = result?.trim();
        if (!texto) return reply({ content: "No se detectó voz en el archivo", flags: MessageFlags.Ephemeral });

        if (texto.length > 3900) {
          return reply({
            content: "La transcripción es muy larga, se envió como archivo:",
            files: [{ attachment: Buffer.from(texto, "utf-8"), name: "transcripcion.txt" }],
          });
        }

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Transcripción")
              .setDescription(texto)
              .setColor(RED)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[util transcribe]", { err: err?.message ?? String(err) });
        await reply({ content: "No se pudo transcribir el archivo", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
