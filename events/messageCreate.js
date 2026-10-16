const { EmbedBuilder } = require("discord.js");
const {
  setConversacion,
  getConversacion,
  generateChatReply,
} = require("../src/ai");
const { getPrefix, DEFAULT_PREFIX } = require("../src/guild");
const { Logger } = require("../src/runtime");
const {
  MAX_HISTORIAL,
  MAX_EMBED_DESCRIPTION,
  RED,
} = require("../src/config");

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

      const pregunta = message.content?.trim();
      if (!pregunta) return;

      // Evitar conflicto si el usuario está ejecutando un comando con prefijo mientras hace reply
      const prefix = message.guildId ? await getPrefix(message.guildId) : DEFAULT_PREFIX;
      if (pregunta.startsWith(prefix)) return;

      const repliedMsg =
        message.channel.messages.cache.get(message.reference.messageId) ??
        (await message.channel.messages.fetch(message.reference.messageId).catch(() => null));

      // Solo procesar si el mensaje al que se responde es de este bot
      if (!repliedMsg || repliedMsg.author.id !== _bot.user.id) return;

      // Ignorar replies a embeds interactivos de menús (como /help, /user info, /server info) que tienen componentes activos
      if (repliedMsg.components?.length > 0 && !repliedMsg.embeds?.[0]?.author) return;

      await message.channel.sendTyping().catch(() => {});

      const userData = getConversacion(message.author.id);
      let historial = Array.isArray(userData?.historial)
        ? [...userData.historial.slice(-MAX_HISTORIAL)]
        : [];

      // Si no había sesión activa o el usuario responde a un mensaje distinto al último guardado,
      // inyectamos el texto del mensaje respondido para que la IA sepa exactamente de qué le hablan
      const prevTexto = repliedMsg.embeds?.[0]?.description || repliedMsg.content;
      if (prevTexto) {
        const cleanPrev = prevTexto.slice(0, 1200);
        const alreadyInHistory = historial.some(
          (m) => m.role === "assistant" && m.content.includes(cleanPrev.slice(0, 80))
        );
        if (!alreadyInHistory) {
          historial.push({ role: "user", content: "(Continuación sobre tu mensaje anterior)" });
          historial.push({ role: "assistant", content: cleanPrev });
        }
      }

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
      log.error("messageCreate IA", { err: err?.message ?? String(err) });
      const isRateLimit = err?.status === 429 || (err?.message ?? "").includes("429");
      const errorMsg = isRateLimit
        ? "Se agotó el límite de consultas de la IA por ahora. Intenta en unos minutos."
        : "Ocurrió un error al procesar tu respuesta con la IA.";

      await message.reply({
        content: errorMsg,
        allowedMentions: SAFE_MENTIONS,
      }).catch(() => {});
    }
  },
};

module.exports = { data: event };
