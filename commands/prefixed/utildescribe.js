const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const net = require("node:net");
const { generateWithFallback } = require("../../utils/ai");

const COLOR = "#ff383d";
const { sendThinkingReply, editThinkingReply } = require("../../utils/thinkingReply");

// ─────────────────────────────────────────────
//  AI
// ─────────────────────────────────────────────

async function generateVision(prompt, imageUrl) {
  const response = await generateWithFallback({
    model: "gemini-3.1-flash-lite-preview",
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/png", data: await fetchToBase64(imageUrl) } },
      ],
    }],
  });
  return response.text?.trim() ?? null;
}

async function fetchToBase64(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL inválida");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Protocolo no permitido");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.startsWith("127.") || host === "::1" || host === "::ffff:127.0.0.1") {
    throw new Error("Host no permitido");
  }
  if (net.isIP(host)) {
    const isPrivateV4 =
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.startsWith("169.254.");
    const normalizedV6 = host.replace(/^\[|\]$/g, "");
    const isPrivateV6 =
      normalizedV6.startsWith("fc") ||
      normalizedV6.startsWith("fd") ||
      /^fe[89ab]/i.test(normalizedV6);
    if (isPrivateV4 || isPrivateV6) throw new Error("IP no permitida");
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo descargar la imagen");
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

// ─────────────────────────────────────────────
//  COMMAND
// ─────────────────────────────────────────────

const data = {
  data: new CommandBuilder({
    name: "describe",
    description: "Describe el contenido de una imagen",
    aliases: ["describir"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const urlArg   = ctx.args?.[0]?.trim();
    const adjunto  = ctx.message?.attachments?.first();
    const imageUrl = urlArg || adjunto?.url;

    if (!imageUrl) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Describe", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nDescribe el contenido de una imagen` +
              `\n\n**Aliases:**\n\`describir\`` +
              `\n\n\`\`\`js\n.describe <adjunto>\nEjemplo: .describe <Subeunaimagenwe.png> \`\`\``
            )
            .setColor(COLOR),
        ],
      });
    }

    try {
      const thinking = await sendThinkingReply(ctx);

      const prompt = `Describe detalladamente qué hay en esta imagen.
Sé específico: colores, objetos, personas, texto visible, ambiente, estilo.
Responde en español. Máximo 3 párrafos.`;

      const texto = await generateVision(prompt, imageUrl);

      await editThinkingReply(thinking, {
        content: "",
        embeds: [
          new EmbedBuilder()
            .setTitle("Descripción de imagen")
            .setDescription(texto?.slice(0, 4000) ?? "No pude generar una descripción")
            .setThumbnail(imageUrl)
            .setColor(COLOR)
            .setTimestamp(),
        ], allowedMentions: { repliedUser: false },
      });

    } catch (err) {
      console.error("[describe prefix]", err);
      await ctx.send("No se pudo procesar la imagen");
    }
  },
};

module.exports = { data };
