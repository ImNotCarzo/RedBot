const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { generateWithFallback } = require("../../utils/ai");

const COLOR = "#ff383d";

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.`;

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
      const response = await generateWithFallback({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{
          role: "user",
          parts: [{ text: `${PERSONA}\nGenera una excusa ridícula, creativa y medianamente plausible para: "${situacion}". Que sea graciosa, original y tenga una narrativa interesante. Máximo 2 párrafos.` }],
        }],
      });

      const texto = response.text?.trim().slice(0, 4000) ?? "No pude generar una excusa";

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
      console.error("[funexcusa]", err);
      await ctx.send("Me ratelimiteó google, f");
    }
  },
};

module.exports = { data };
