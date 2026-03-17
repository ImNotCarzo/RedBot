const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const BLUE = "#5865f2";
const RED  = "#ff383d";

async function attachmentToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar el archivo: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function generateHealer(messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/healer-alpha",
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

const VALID_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
  "audio/webm", "video/mp4", "video/webm",
];

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
              `\n\n\`\`\`js\n.transcribe <url | adjunto>\nEjemplo: .transcribe https://ejemplo.com/audio.mp3\`\`\`` +
              `\n\nFormatos: mp3, wav, ogg, webm, mp4 — máx 8MB`
            )
            .setColor(RED),
        ],
      });
    }

    try {
      let fileUrl  = urlArg || adjunto.url;
      let fileName = adjunto?.name ?? fileUrl.split("/").pop().split("?")[0];

      // Validar tamaño si es adjunto
      if (adjunto && adjunto.size > 8 * 1024 * 1024) {
        return ctx.send("El archivo no puede superar los 8MB");
      }

      // Detectar formato desde nombre o contentType
      const contentType = adjunto?.contentType ?? "";
      const isValid     = VALID_TYPES.some(t => contentType.startsWith(t)) ||
                          /\.(mp3|wav|ogg|webm|mp4)$/i.test(fileName);

      if (!isValid) {
        return ctx.send("Formato no soportado. Usa: mp3, wav, ogg, webm, mp4");
      }

      const ext    = fileName.split(".").pop().toLowerCase();
      const format = ext === "mp4" ? "mp4" : ext || "mp3";

      const base64 = await attachmentToBase64(fileUrl);

      const texto = await generateHealer([{
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe exactamente lo que se dice en este audio. Si hay múltiples hablantes, indícalo. Responde solo con la transcripción, sin comentarios adicionales.",
          },
          {
            type: "input_audio",
            input_audio: { data: base64, format },
          },
        ],
      }]);

      if (!texto) return ctx.send("No se pudo transcribir el audio");

      // Si es muy largo, enviar como archivo
      if (texto.length > 3900) {
        return ctx.send({
          content: "La transcripción es muy larga, se envió como archivo:",
          files: [{ attachment: Buffer.from(texto, "utf-8"), name: "transcripcion.txt" }],
        });
      }

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Transcripción")
            .setDescription(texto)
            .setColor(RED)
            .setFooter({ text: fileName })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[transcribe]", err);
      await ctx.send("No se pudo transcribir el archivo");
    }
  },
};

module.exports = { data };
