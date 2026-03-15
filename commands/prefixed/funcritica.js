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
    name: "critica",
    description: "Te doy una crítica despiadada de algo",
    aliases: ["criticar", "criticize"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const tema = ctx.args?.join(" ").trim();

    if (!tema) {
      const bot = ctx.client.user;
      const paramerror = new EmbedBuilder()
        .setAuthor({ name: "Comando Critica", iconURL: bot.displayAvatarURL() })
        .setDescription(
          `\`\`\`\n.critica <tema>\nEjemplo: .critica la chochoinflación\`\`\`` +
          `\n\n**Usos:**\nGenera una crítica despiadada de algo` +
          `\n\n**Aliases:**\ncriticar, criticize`
        );

      return ctx.send({ embeds: [paramerror] });
    }

    try {
      const response = await generateWithFallback({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{
          role: "user",
          parts: [{ text: `${PERSONA}\nHaz una crítica directa, ingeniosa y sin piedad de: "${tema}". Señala sus puntos débiles con humor y sarcasmo. Máximo 3 párrafos, sin introducción genérica.` }],
        }],
      });

      const texto = response.text?.trim().slice(0, 4000) ?? "No pude generar una crítica";

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
      console.error("[funcritica]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
