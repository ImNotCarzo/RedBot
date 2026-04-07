const { EmbedBuilder } = require("discord.js");
const { setConversacion, getConversacion } = require("../services/memory.service");
const { generateWithFallback, needsSearchAI, toGeminiHistory } = require("../services/ai.service");
const { registerBotEvent } = require("./eventRuntime");
const {
  MAX_HISTORIAL,
  SYSTEM_PROMPT,
  MAX_EMBED_DESCRIPTION,
  AI_MODEL_DEFAULT,
  AI_MODEL_SEARCH,
} = require("../config/constants");

const TRUNCATION_SUFFIX = "\n*(respuesta recortada)*";

/**
 * Register the `messageCreate` handler that powers AI follow-up conversations.
 *
 * The handler activates only when:
 * - The message is a reply to the bot's last AI response.
 * - The user has an active conversation session (tracked via askMemory).
 *
 * @param {import("gralonium").Gralonium} bot
 * @param {import("../core/logger")} [log]
 */
function registerMessageHandler(bot, log) {
  registerBotEvent(bot, {
    name: "messageCreate",
    source: "handlers/messageHandler",
    async code(_bot, message) {
    try {
      if (message.author.bot)            return;
      if (!message.reference?.messageId) return;

      const userData = getConversacion(message.author.id);
      if (!userData) return;
      if (message.reference.messageId !== userData.lastBotMessageId) return;

      const pregunta = message.content.trim();
      if (!pregunta) return;

      await message.channel.sendTyping().catch(() => {});

      // ── Build history ─────────────────────────────────────────────────
      const historial = Array.isArray(userData.historial)
        ? userData.historial.slice(-MAX_HISTORIAL)
        : [];
      historial.push({ role: "user", content: pregunta });

      // ── AI generation ─────────────────────────────────────────────────
      const usarSearch = await needsSearchAI(pregunta);
      const model      = usarSearch ? AI_MODEL_SEARCH : AI_MODEL_DEFAULT;
      const config     = usarSearch ? { tools: [{ googleSearch: {} }] } : {};

      const response = await generateWithFallback({
        model,
        contents: [
          { role: "user",  parts: [{ text: SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Entendido." }] },
          ...toGeminiHistory(historial),
        ],
        config,
      });

      const respuesta = response.text?.trim() || "No pude generar una respuesta";

      // ── Persist history ────────────────────────────────────────────────
      historial.push({ role: "assistant", content: respuesta });
      const historialFinal = historial.length > MAX_HISTORIAL
        ? historial.slice(-MAX_HISTORIAL)
        : historial;

      // ── Build embed ────────────────────────────────────────────────────
      const maxTexto = MAX_EMBED_DESCRIPTION - TRUNCATION_SUFFIX.length;
      const texto    = respuesta.length > maxTexto
        ? respuesta.slice(0, maxTexto) + TRUNCATION_SUFFIX
        : respuesta;

      const embed = new EmbedBuilder()
        .setAuthor({
          name:    message.author.username,
          iconURL: message.author.displayAvatarURL({ size: 128 }),
        })
        .setDescription(texto)
        .setColor("#ff383d");

      const botMsg = await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      setConversacion(message.author.id, historialFinal, botMsg.id);

    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429");
      if (isRateLimit) {
        log?.warn("messageCreate IA: límite de tasa alcanzado", { err: err.message });
        await message.reply({
          content: "⚠️ El servicio de IA está temporalmente sobrecargado. Por favor intenta de nuevo en unos segundos.",
          allowedMentions: { repliedUser: false },
        }).catch(() => {});
      } else {
        log?.error("messageCreate IA", { err: err.message });
      }
    }
    },
  }, log);
}

module.exports = { registerMessageHandler };
