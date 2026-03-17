const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

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
            .setAuthor({ name: "Comando Critica", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nGenera una crítica despiadada de algo` +
              `\n\n**Aliases:**\n\`criticar\`, \`criticize\`` +
              `\n\n\`\`\`js\n.critica <tema>\nEjemplo: .critica la chochoinflación\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    try {
      const prompt = `${PERSONA}\nHaz una crítica directa, ingeniosa y sin piedad de: "${tema}". Señala sus puntos débiles con humor y sarcasmo. Máximo 3 párrafos, sin introducción genérica.`;
      const texto  = (await generateHealer(prompt))?.slice(0, 4000) ?? "No pude generar una crítica";

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Crítica de: ${tema}`)
            .setDescription(texto)
            .setColor(RED)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[fun critica]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
