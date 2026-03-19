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
    name: "translate",
    description: "Traduce texto a otro idioma",
    aliases: ["traducir", "trans"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const args   = ctx.args ?? [];
    const ultimo = args[args.length - 1];

    const esIdioma = ultimo && !ultimo.includes(" ") && args.length > 1;
    const idioma   = esIdioma ? ultimo : "español";
    const texto    = esIdioma
      ? args.slice(0, -1).join(" ").trim()
      : args.join(" ").trim();

    if (!texto) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `**Uso:**\n\`.translate <texto> [idioma]\`\n\n` +
              `Ejemplo: \`.translate hello español\``
            )
            .setColor(COLOR),
        ],
      });
    }

    try {
      const prompt =
        `Traduce el siguiente texto al ${idioma}.\n` +
        `Responde ÚNICAMENTE con este formato JSON, sin texto adicional:\n` +
        `{"origen": "<idioma detectado en español>", "traduccion": "<texto traducido>"}\n\n` +
        `Texto: ${texto}`;

      const respuesta = await generateGeminiText(prompt);

      let origen     = "desconocido";
      let traduccion = null;

      try {
        const parsed = JSON.parse(respuesta ?? "");
        origen     = parsed.origen     ?? "desconocido";
        traduccion = parsed.traduccion ?? null;
      } catch {
        traduccion = respuesta;
      }

      if (!traduccion) {
        return ctx.send("No se pudo generar la traducción");
      }

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Traducción")
            .setColor(COLOR)
            .addFields(
              { name: "Original",   value: texto.slice(0, 1024),      inline: false },
              { name: "Traducción", value: traduccion.slice(0, 1024), inline: false },
            )
            .setFooter({ text: `${origen} → ${idioma}` })
            .setTimestamp(),
        ],
      });

    } catch (err) {
      console.error("[translate prefix]", err);
      await ctx.send("No se pudo conectar con el servicio de traducción");
    }
  },
};

module.exports = { data };
