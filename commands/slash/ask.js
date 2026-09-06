const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { generateWithFallback, needsSearchAI, toGeminiHistory, setConversacion, getConversacion } = require("../../src/ai");
const { MAX_HISTORIAL, SYSTEM_PROMPT, AI_MODEL_DEFAULT, AI_MODEL_SEARCH } = require("../../src/config");
const { RED } = require("../../utils/colors");
const { sendThinkingReply, editThinkingReply } = require("../_shared/thinking");
const { createCommandLogger } = require("../_shared/runtime");

const log = createCommandLogger("CMD_ASK");

const data = {
  data: new CommandBuilder({
    name: "ask",
    description: "Hazle una pregunta a la IA",
    aliases: ["ia", "ai"],
    as_prefix: true,
    as_slash: true,
  }),
  params: new ParamsBuilder().addString({
    name: "pregunta",
    description: "¿Qué quieres preguntar?",
    required: true,
  }),

  async code(ctx) {
    const pregunta = ctx.interaction
      ? ctx.get("pregunta")
      : ctx.args?.join(" ").trim();

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
      const userId = ctx.user?.id ?? ctx.author?.id;
      const username = ctx.user?.username ?? ctx.author?.username;
      const invoker = ctx.user ?? ctx.author;
      const isSlash = !!ctx.interaction;

      let thinking;
      if (isSlash) {
        await ctx.interaction.deferReply();
      } else {
        thinking = await sendThinkingReply(ctx);
      }

      const prev = getConversacion(userId);
      const historial = prev?.historial ?? [];
      historial.push({ role: "user", content: pregunta });

      const usarSearch = await needsSearchAI(pregunta);

      const model = usarSearch ? AI_MODEL_SEARCH : AI_MODEL_DEFAULT;
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
      if (historial.length > MAX_HISTORIAL) historial.splice(0, historial.length - MAX_HISTORIAL);

      const texto = respuesta.length > 4000
        ? respuesta.slice(0, 4000) + "\n*(respuesta recortada)*"
        : respuesta;

      const embed = new EmbedBuilder()
        .setAuthor({ name: username, iconURL: invoker?.displayAvatarURL({ size: 128 }) })
        .setDescription(texto)
        .setColor("#ff383d");

      if (isSlash) {
        await ctx.interaction.editReply({ embeds: [embed] });
        const sent = await ctx.interaction.fetchReply();
        setConversacion(userId, historial, sent.id);
      } else {
        await editThinkingReply(thinking, { content: "", embeds: [embed] });
        setConversacion(userId, historial, thinking.id);
      }

    } catch (err) {
      log.error("Error en ask", { err: err?.message ?? String(err) });
      if (ctx.interaction) {
        await ctx.interaction.editReply("Algo salió mal, intenta de nuevo").catch(() => {});
      } else {
        await ctx.send("Ocurrió un error, intenta de nuevo");
      }
    }
  },
};

module.exports = { data };
