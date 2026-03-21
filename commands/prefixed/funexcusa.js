const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { getAI } = require("../../utils/ai");

const COLOR = "#ff383d";
const { sendThinkingReply, editThinkingReply } = require("../../utils/thinkingReply");

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

async function generateGemma(prompt) {
  const response = await getAI().models.generateContent({
    model: "gemma-3-12b-it",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 1.0 },
  });
  return response.text?.trim() ?? null;
}

const data = {
  data: new CommandBuilder({
    name: "excusa",
    description: "Genera una excusa ridícula pero creativa",
    aliases: ["coartada", "excuse"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const situacion = ctx.args?.join(" ").trim() || "cualquier situación";

    try {
      const thinking = await sendThinkingReply(ctx);

      const prompt = `${PERSONA}
Genera una excusa ridícula, creativa y medianamente plausible para: "${situacion}".
Que sea graciosa, original y tenga una narrativa interesante.
Máximo 2 párrafos.`;

      const texto = (await generateGemma(prompt))?.slice(0, 4000)
        ?? "No pude generar una excusa";

      await editThinkingReply(thinking, {
        content: "",
        embeds: [
          new EmbedBuilder()
            .setTitle("Tu excusa profesional")
            .setDescription(texto)
            .setColor(COLOR)
            .setTimestamp(),
        ], allowedMentions: { repliedUser: false },
      });

    } catch (err) {
      console.error("[fun excusa prefix]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
