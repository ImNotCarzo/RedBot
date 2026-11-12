const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { generateChatReply, setConversacion, getConversacion } = require("../../src/ai");
const { MAX_HISTORIAL, RED } = require("../../src/config");
const {
  Logger,
  THINKING_TEXT,
  handleCommandError,
} = require("../../src/runtime");

const log = new Logger("CMD_ASK", process.env.LOG_LEVEL);

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

      await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });

      const scope = ctx.guild?.id ?? "dm";
      const prev = getConversacion(userId, scope);
      const historial = [...(prev?.historial ?? [])];
      historial.push({ role: "user", content: pregunta });

      const respuesta = await generateChatReply(historial);
      historial.push({ role: "assistant", content: respuesta });
      if (historial.length > MAX_HISTORIAL) historial.splice(0, historial.length - MAX_HISTORIAL);

      const texto = respuesta.length > 4000
        ? respuesta.slice(0, 4000) + "\n*(respuesta recortada)*"
        : respuesta;

      const embed = new EmbedBuilder()
        .setAuthor({ name: username, iconURL: invoker?.displayAvatarURL({ size: 128 }) })
        .setDescription(texto)
        .setColor(RED);

      const sent = await ctx.send({ embeds: [embed] });
      setConversacion(userId, historial, sent?.id ?? null, scope);

    } catch (err) {
      log.error("Error en ask", { err: err?.message ?? String(err) });
      handleCommandError(ctx, err);
    }
  },
};

module.exports = { data };
