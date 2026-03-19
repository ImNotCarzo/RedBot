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
    name: "opinion",
    description: "Pide mi opinión sin filtro sobre algo",
    aliases: ["op", "opina"],
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
              `**Uso:**\n\`.opinion <tema>\`\n\n` +
              `Ejemplo: \`.opinion la gente que aplaude en el avión\``
            )
            .setColor(COLOR),
        ],
      });
    }

    try {
      const prompt = `${PERSONA}
Da tu opinión personal, sarcástica y sin filtro sobre: "${tema}".
Máximo 3 párrafos, sin introducción genérica, ve directo al punto.`;

      const texto = (await generateGemma(prompt))?.slice(0, 4000)
        ?? "No pude generar una opinión";

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Mi opinión sobre: ${tema}`)
            .setDescription(texto)
            .setColor(COLOR)
            .setTimestamp(),
        ],
      });

    } catch (err) {
      console.error("[fun opinion prefix]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
