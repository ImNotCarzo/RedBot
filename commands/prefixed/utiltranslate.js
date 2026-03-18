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
    name: "translate",
    description: "Traduce texto a otro idioma",
    aliases: ["traducir", "trans"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const args    = ctx.args ?? [];
    const ultimo  = args[args.length - 1];
    const esIdioma = ultimo && !ultimo.includes(" ") && args.length > 1;
    const idioma  = esIdioma ? ultimo : "español";
    const texto   = esIdioma ? args.slice(0, -1).join(" ").trim() : args.join(" ").trim();

    if (!texto) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Translate", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nTraduce texto a cualquier idioma` +
              `\n\n**Aliases:**\n\`traducir\`, \`trans\`` +
              `\n\n\`\`\`js\n.translate <texto> [idioma]\nEjemplo: .translate כלב español\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    try {
      const respuesta = await generateHealer([{
        role: "user",
        content:
          `Traduce el siguiente texto al ${idioma}.\n` +
          `Responde ÚNICAMENTE con este formato JSON, sin texto adicional ni backticks:\n` +
          `{"origen": "<idioma detectado en español>", "traduccion": "<texto traducido>"}\n\n` +
          `Texto: ${texto}`,
      }]);

      let origen     = "desconocido";
      let traduccion = null;

      try {
        const parsed = JSON.parse(respuesta);
        origen     = parsed.origen     ?? "desconocido";
        traduccion = parsed.traduccion ?? null;
      } catch {
        traduccion = respuesta;
      }

      if (!traduccion)
        return ctx.send("No se pudo generar la traducción");

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Traducción")
            .setColor(RED)
            .addFields(
              { name: "Original",   value: texto.slice(0, 1024),      inline: false },
              { name: "Traducción", value: traduccion.slice(0, 1024), inline: false },
            )
            .setFooter({ text: `${origen} → ${idioma}` })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[translate]", err);
      await ctx.send("No se pudo conectar con el servicio de traducción");
    }
  },
};

module.exports = { data };
