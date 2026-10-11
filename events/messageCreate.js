const { EmbedBuilder } = require("discord.js");
const {
  setConversacion,
  getConversacion,
  generateChatReply,
} = require("../src/ai");
const Logger = require("../src/logger");
const {
  MAX_HISTORIAL,
  MAX_EMBED_DESCRIPTION,
} = require("../src/config");
const { RED } = require("../utils/colors");

const log = new Logger("EVENT_MESSAGE", process.env.LOG_LEVEL);
const TRUNCATION_SUFFIX = "\n*(respuesta recortada)*";
const SAFE_MENTIONS = { parse: [], repliedUser: false };

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
      if (userData.lastBotMessageId && repliedMsg.id !== userData.lastBotMessageId) return;

      const pregunta = message.content.trim();
      if (!pregunta) return;

      await message.channel.sendTyping().catch(() => {});

      const historial = Array.isArray(userData.historial)
        ? userData.historial.slice(-MAX_HISTORIAL)
        : [];
      historial.push({ role: "user", content: pregunta });

      const respuesta = await generateChatReply(historial);

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
        botMsg = await message.reply({ embeds: [embed], allowedMentions: SAFE_MENTIONS });
      } catch (sendErr) {
        if (sendErr?.code === 50013 || sendErr?.code === 50006) {
          botMsg = await message.reply({ content: texto, allowedMentions: SAFE_MENTIONS });
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
