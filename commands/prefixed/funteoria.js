const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { generateWithFallback } = require("../../utils/ai");

const { RED } = require("../../utils/colors");

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.`;

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
      const bot = ctx.bot.user;
      const paramerror = new EmbedBuilder()
        .setAuthor({ name: "Comando Teoria", iconURL: bot.displayAvatarURL() })
        .setDescription(
          `**Usos:**\nGenera una teoría conspirativa sobre cualquier cosa` +
          `\n\n**Aliases:**\n\`conspira\`, \`conspiracion\`, \`theory\`` +
          `\n\n\`\`\`js\n.teoria <tema>\nEjemplo: .teoria ¿las palomas existen?\`\`\``
        )
        .setColor(RED);

      return ctx.send({ embeds: [paramerror] });
    }
    try {
      const response = await generateWithFallback({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{
          role: "user",
          parts: [{ text: `${PERSONA}\nCrea una teoría conspirativa ridícula pero internamente consistente sobre: "${tema}". Preséntala como si fuera verdad, con "evidencia" inventada y conexiones absurdas. Máximo 3 párrafos, sin aclarar que es ficción.` }],
        }],
      });

      const texto = response.text?.trim().slice(0, 4000) ?? "No pude generar una teoría";

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Teoría: ${tema}`)
            .setDescription(texto)
            .setColor(RED)
            .setFooter({ text: "Esto es ficción... o quizás no." })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[funteoría]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
