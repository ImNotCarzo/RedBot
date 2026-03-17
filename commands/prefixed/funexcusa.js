const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const COLOR = "#ff383d";

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

async function generateHealer(prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/healer-alpha",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() ?? null;
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
      const prompt = `${PERSONA}\nGenera una excusa ridícula, creativa y medianamente plausible para: "${situacion}". Que sea graciosa, original y tenga una narrativa interesante. Máximo 2 párrafos.`;
      const texto  = (await generateHealer(prompt))?.slice(0, 4000) ?? "No pude generar una excusa";

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Tu excusa profesional")
            .setDescription(texto)
            .setColor(COLOR)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[fun excusa]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
