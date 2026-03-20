const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { generateWithFallback, needsSearchAI, toGeminiHistory } = require("../../utils/ai");
const { MAX_HISTORIAL, setConversacion, getConversacion } = require("../../utils/askMemory");
const { RED } = require("../../utils/colors");

const SYSTEM_PROMPT = `Eres RedBot, un asistente dentro de un bot de Discord.
Personalidad: sarcástico, ingenioso e irreverente pero sin pasarte de la raya, tampoco seas super arrogante.
Hablas como un amigo que sabe mucho, no como un manual técnico ni un bot genérico.
Hablas español neutro, sin regionalismos de ningún país específico. Usas español informal y neutro, sin voseo de base o algún otro tipo de acento, sin "usted" y sin formalismos, a menos que el usuario te escriba así, por ejemplo si usa voseo le respondes con eso, sino neutral.
Sin emojis salvo que realmente sumen al mensaje.
Si alguien pregunta algo obvio lo respondes con un toque de "en serio me preguntas eso?".
Si alguien te insulta respondes con ingenio, no con sumisión.
Si la pregunta es técnica la respondes bien pero sin sonar a wikipedia.
Jamás uses frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!" ni nada por el estilo.
Respondes en el mismo idioma que el usuario.
Mantén el contexto de la conversación.
Solo menciona comandos si el usuario los pide o es claramente necesario.`;

const data = {
  data: new CommandBuilder({
    name: "ask",
    description: "Hazle una pregunta a la IA",
    aliases: ["ia", "ai"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const pregunta = ctx.args?.join(" ").trim();

    if (!pregunta) {
      const bot = ctx.bot.user;
      const paramerror = new EmbedBuilder()
        .setAuthor({ name: "Comando Ask", iconURL: bot.displayAvatarURL() })
        .setDescription(
          `**Usos:**\nHazle una pregunta a la IA` +
          `\n\n**Aliases:**\n\`ia\`, \`ai\`` +
          `\n\n\`\`\`js\n.ask <pregunta>\nEjemplo: .ask cuando te apagan\`\`\``
        )
        .setColor(RED);

      return ctx.send({ embeds: [paramerror] });
    }

    try {
      const userId = ctx.author.id;
      const username = ctx.author.username;
      const invoker = ctx.author;

      const thinking = await ctx.send("<a:typing:1484407380291616778> RedBot está pensando...");

      const prev = getConversacion(userId);
      const historial = prev?.historial ?? [];
      historial.push({ role: "user", content: pregunta });

      const usarSearch = await needsSearchAI(pregunta);

      const model = usarSearch ? "gemini-2.5-flash" : "gemini-3.1-flash-lite-preview";
      const config = usarSearch ? { tools: [{ googleSearch: {} }] } : {};

      const response = await generateWithFallback({
        model,
        contents: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Entendido." }] },
          ...toGeminiHistory(historial),
        ],
        config,
      });

      const respuesta = response.text ?? "No pude generar una respuesta";
      historial.push({ role: "assistant", content: respuesta });

      if (historial.length > MAX_HISTORIAL) {
        historial.splice(0, historial.length - MAX_HISTORIAL);
      }

      const texto = respuesta.length > 4000
        ? respuesta.slice(0, 4000) + "\n*(respuesta recortada)*"
        : respuesta;

      const embed = new EmbedBuilder()
        .setAuthor({ name: username, iconURL: invoker.displayAvatarURL({ size: 128 }) })
        .setDescription(texto)
        .setColor("#ff383d");

      await thinking.edit({ content: "", embeds: [embed] });
      setConversacion(userId, historial, thinking.id);

    } catch (err) {
      console.error("Error en ask:", err);
      await ctx.send("Ocurrió un error, intenta de nuevo");
    }
  },
};

module.exports = { data };
