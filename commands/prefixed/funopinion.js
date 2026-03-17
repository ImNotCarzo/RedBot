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
            .setAuthor({ name: "Comando Opinion", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nPide mi opinión sin filtro sobre algo` +
              `\n\n**Aliases:**\n\`op\`, \`opina\`` +
              `\n\n\`\`\`js\n.opinion <tema>\nEjemplo: .opinion la chochoinflación\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    try {
      const prompt = `${PERSONA}\nDa tu opinión personal, sarcástica y sin filtro sobre: "${tema}". Máximo 3 párrafos, sin introducción genérica, ve directo al punto.`;
      const texto  = (await generateHealer(prompt))?.slice(0, 4000) ?? "No pude generar una opinión";

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
      console.error("[fun opinion]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
