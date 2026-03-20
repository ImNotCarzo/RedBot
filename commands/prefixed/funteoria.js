const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { getAI } = require("../../utils/ai");

const COLOR = "#ff383d";

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

// AI

async function generateGemma(prompt) {
  const response = await getAI().models.generateContent({
    model: "gemma-3-12b-it",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 1.0,
    },
  });
  return response.text?.trim() ?? null;
}

// COMMAND

const data = {
  data: new CommandBuilder({
    name: "teoria",
    description: "Una teoría conspirativa sobre cualquier cosa",
    aliases: ["conspira", "conspiracion", "theory"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const tema = ctx.args?.join(" ").trim();

    if (!tema) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Teoria", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nGenera una teoría conspirativa sobre cualquier cosa` +
              `\n\n**Aliases:**\n\`conspira\`, \`conspiracion\`, \`theory\`` +
              `\n\n\`\`\`js\n.teoria <tema>\nEjemplo: .teoria las palomas son drones\`\`\``
            )
            .setColor(COLOR),
        ],
      });
    }

    try {
      const thinking = await ctx.send("<a:typing:1484407380291616778>  RedBot está pensando...");

      const prompt = `${PERSONA}
Crea una teoría conspirativa ridícula pero internamente consistente sobre: "${tema}".
Preséntala como si fuera verdad, con "evidencia" inventada y conexiones absurdas.
Máximo 3 párrafos, sin aclarar que es ficción.`;

      const texto = (await generateGemma(prompt))?.slice(0, 4000)
        ?? "No pude generar una teoría";

      await thinking.edit({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setTitle(`Teoría: ${tema}`)
            .setDescription(texto)
            .setColor(COLOR)
            .setFooter({ text: "Esto es ficción... o quizás no." })
            .setTimestamp(),
        ],
      });

    } catch (err) {
      console.error("[fun teoria prefix]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
