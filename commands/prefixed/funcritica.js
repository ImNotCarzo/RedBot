const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { GoogleGenAI } = require("@google/genai");

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

const COLOR = "#ff383d";

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

// ─────────────────────────────────────────────
//  AI
// ─────────────────────────────────────────────

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI });
}

async function generateGemma(prompt) {
  const response = await getAI().models.generateContent({
    model: "gemma-3-12b-it",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return response.text?.trim() ?? null;
}

// ─────────────────────────────────────────────
//  COMMAND
// ─────────────────────────────────────────────

const data = {
  data: new CommandBuilder({
    name: "critica",
    description: "Te doy una crítica despiadada de algo",
    aliases: ["criticar", "criticize"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const tema = ctx.args?.join(" ").trim();

    if (!tema) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `**Uso:**\n\`.critica <tema>\`\n\n` +
              `Ejemplo: \`.critica los trabajos en grupo\``
            )
            .setColor(COLOR),
        ],
      });
    }

    try {
      const prompt = `${PERSONA}
Haz una crítica directa, ingeniosa y sin piedad de: "${tema}".
Señala sus puntos débiles con humor y sarcasmo.
Máximo 3 párrafos, sin introducción genérica.`;

      const texto = (await generateGemma(prompt))?.slice(0, 4000)
        ?? "No pude generar una crítica";

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Crítica de: ${tema}`)
            .setDescription(texto)
            .setColor(COLOR)
            .setTimestamp(),
        ],
      });

    } catch (err) {
      console.error("[fun critica prefix]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
