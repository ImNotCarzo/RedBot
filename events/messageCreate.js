const { EmbedBuilder } = require("discord.js");
const {
  setConversacion,
  getConversacion,
  generateWithFallback,
  toGeminiHistory,
} = require("../src/ai");
const Logger = require("../src/logger");
const {
  MAX_HISTORIAL,
  SYSTEM_PROMPT,
  MAX_EMBED_DESCRIPTION,
  AI_MODEL_SEARCH,
} = require("../src/config");
const { RED } = require("../utils/colors");

const log = new Logger("EVENT_MESSAGE", process.env.LOG_LEVEL);
const TRUNCATION_SUFFIX = "\n*(respuesta recortada)*";

const event = {
  name: "messageCreate",
  once: false,
  async code(_bot, message) {
    try {
      if (message.author.bot) return;
      if (!message.reference?.messageId) return;

      const userData = getConversacion(message.author.id);
      if (!userData) return;
      
      const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      if (!repliedMsg || repliedMsg.author.id !== _bot.user.id) return;

      const pregunta = message.content.trim();
      if (!pregunta) return;

      await message.channel.sendTyping().catch(() => {});

      const historial = Array.isArray(userData.historial)
        ? userData.historial.slice(-MAX_HISTORIAL)
        : [];
      historial.push({ role: "user", content: pregunta });

      const model = AI_MODEL_SEARCH;
      const config = { tools: [{ googleSearch: {} }] };

      const response = await generateWithFallback({
        model,
        contents: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Entendido." }] },
          ...toGeminiHistory(historial),
        ],
        config,
      });

      const respuesta = response.text?.trim() || "No pude generar una respuesta";

      historial.push({ role: "assistant", content: respuesta });
      const historialFinal = historial.length > MAX_HISTORIAL
        ? historial.slice(-MAX_HISTORIAL)
        : historial;

      const maxTexto = MAX_EMBED_DESCRIPTION - TRUNCATION_SUFFIX.length;
      const texto = respuesta.length > maxTexto
        ? respuesta.slice(0, maxTexto) + TRUNCATION_SUFFIX
        : respuesta;

      const embed = new EmbedBuilder()
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL({ size: 128 }),
        })
        .setDescription(texto)
        .setColor(RED);

      let botMsg;
      try {
        botMsg = await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (sendErr) {
        if (sendErr?.code === 50013 || sendErr?.code === 50006) {
          botMsg = await message.reply({ content: texto, allowedMentions: { repliedUser: false } });
        } else {
          throw sendErr;
        }
      }
      setConversacion(message.author.id, historialFinal, botMsg.id);
    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429");
      if (isRateLimit) {
        log.warn("messageCreate IA: límite de tasa alcanzado", { err: err.message });
        await message.reply({
          content: "Se acabaron los tokens",
          allowedMentions: { repliedUser: false },
        }).catch(() => {});
      } else {
        log.error("messageCreate IA", { err: err.message });
      }
    }
  },
};

module.exports = { data: event };
