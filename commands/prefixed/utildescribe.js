const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
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
  const res = await fetch(url);
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
        ],
      });

    } catch (err) {
      console.error("[describe prefix]", err);
      await ctx.send("No se pudo procesar la imagen");
    }
  },
};

module.exports = { data };
