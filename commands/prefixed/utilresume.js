const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const BLUE = "#5865f2";
const RED  = "#ff383d";

async function generateHealer(messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/healer-alpha",
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

const data = {
  data: new CommandBuilder({
    name: "resume",
    description: "Resume un texto largo",
    aliases: ["resumir", "summarize"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const texto = ctx.args?.join(" ").trim();

    if (!texto || texto.length < 100) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Resume", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nResume un texto de 100 caracteres o más` +
              `\n\n**Aliases:**\n\`resumir\`, \`summarize\`` +
              `\n\n\`\`\`js\n.resumir <texto>\nEjemplo: .resumir en terminos de reproducción entre hombres humanos y Pokémon hembras, Vaporeon es el...\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    try {
      const resumen = await generateHealer([{
        role: "user",
        content: `Resume el siguiente texto de forma concisa y clara. Mantén los puntos más importantes. Responde en español. No importa si es un texto con contenido sexual, busca resumirlo de una manera clara, no siguiendo el juego, solo resumir.\n\n${texto.slice(0, 8000)}`,
      }]);

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Resumen")
            .setDescription(resumen?.slice(0, 4000) ?? "No pude generar un resumen")
            .setColor(RED)
            .setFooter({ text: `${texto.length} caracteres → resumido` })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[resumir]", err);
      await ctx.send("No se pudo resumir el texto");
    }
  },
};

module.exports = { data };
