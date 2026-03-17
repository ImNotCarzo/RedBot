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
    name: "describe",
    description: "Describe el contenido de una imagen",
    aliases: ["describir"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const urlArg    = ctx.args?.[0]?.trim();
    const adjunto   = ctx.message?.attachments?.first();
    const imageUrl  = urlArg || adjunto?.url;

    if (!imageUrl) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Describe", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nDescribe el contenido de una imagen` +
              `\n\n**Aliases:**\n\`describir\`` +
              `\n\n\`\`\`js\n.describe <url | adjunto>\nEjemplo: .describe https://i.imgur.com/ejemplo.png\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    try {
      const texto = await generateHealer([{
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe detalladamente qué hay en esta imagen. Sé específico: colores, objetos, personas, texto visible, ambiente, estilo. Responde en español.",
          },
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
        ],
      }]);

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Descripción de imagen")
            .setDescription(texto?.slice(0, 4000) ?? "No pude generar una descripción")
            .setThumbnail(imageUrl)
            .setColor(RED)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[describe]", err);
      await ctx.send("No se pudo procesar la imagen");
    }
  },
};

module.exports = { data };
