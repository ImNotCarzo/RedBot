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
    name: "opinion",
    description: "Pide mi opinión sin filtro sobre algo",
    aliases: ["op", "opina"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const tema = ctx.args?.join(" ").trim();

    if (!tema) {
      const bot = ctx.bot.user;
      const paramerror = new EmbedBuilder()
        .setAuthor({ name: "Comando Opinion", iconURL: bot.displayAvatarURL() })
        .setDescription(
          `\`\`\`js\n.opinion <tema>\nEjemplo: .opinion la chochoinflación\`\`\`` +
          `\n\n**Usos:**\nPide mi opinión sin filtro sobre algo` +
          `\n\n**Aliases:**\nop, opina`
        )
        .setColor(RED);

      return ctx.send({ embeds: [paramerror] });
    }

    try {
      const response = await generateWithFallback({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{
          role: "user",
          parts: [{ text: `${PERSONA}\nDa tu opinión personal, sarcástica y sin filtro sobre: "${tema}". Máximo 3 párrafos, sin introducción genérica, ve directo al punto.` }],
        }],
      });

      const texto = response.text?.trim().slice(0, 4000) ?? "No pude generar una opinión";

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Mi opinión sobre: ${tema}`)
            .setDescription(texto)
            .setColor(RED)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[funopinion]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
