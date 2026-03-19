const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { generateWithFallback } = require("../../utils/ai");

const COLOR = "#ff383d";

// ─────────────────────────────────────────────
//  AI
// ─────────────────────────────────────────────

async function generateGeminiText(prompt) {
  const response = await generateWithFallback({
    model: "gemini-3.1-flash-lite-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return response.text?.trim() ?? null;
}

// ─────────────────────────────────────────────
//  COMMAND
// ─────────────────────────────────────────────

const data = {
  data: new CommandBuilder({
    name: "resume",
    description: "Resume un texto largo",
    aliases: ["resumir", "summarize"],
    as_prefix: true,
    as_slash: false,
  }),
  usesAI: true,
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
              `\n\n\`\`\`js\n.resume <texto>\nEjemplo: .resume en terminos de reproducción entre hombres humanos y Pokémon hembras, Vaporeon es el...\`\`\``
            )
            .setColor(COLOR),
        ],
      });
    }

    const typing = setInterval(() => {
      ctx.channel?.sendTyping?.().catch(() => {});
    }, 8000);

    try {
      const prompt = `Resume el siguiente texto.
Solo el resumen, sin frases previas ni comentarios adicionales.
Debe ser claro, conciso y fiel al contenido original.
Sin opiniones ni interpretaciones.
Responde en español.

${texto.slice(0, 8000)}`;

      const resumen = await generateGeminiText(prompt);

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Resumen")
            .setDescription(resumen?.slice(0, 4000) ?? "No pude generar un resumen")
            .setColor(COLOR)
            .setFooter({ text: `${texto.length} caracteres → resumido` })
            .setTimestamp(),
        ],
      });

    } catch (err) {
      console.error("[resume prefix]", err);
      await ctx.send("No se pudo resumir el texto");
    } finally {
      clearInterval(typing);
    }
  },
};

module.exports = { data, usesAI: true };
