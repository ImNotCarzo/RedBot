const { EmbedBuilder } = require("discord.js");
const {
  setConversacion,
  getConversacion,
  generateChatReply,
} = require("../src/ai");
const { getPrefix, DEFAULT_PREFIX, getAfk, removeAfk } = require("../src/guild");
const { Logger } = require("../src/runtime");
const {
  MAX_HISTORIAL,
  MAX_EMBED_DESCRIPTION,
  RED,
} = require("../src/config");

const log = new Logger("EVENT_MESSAGE", process.env.LOG_LEVEL);
const TRUNCATION_SUFFIX = "\n*(respuesta recortada)*";
const SAFE_MENTIONS = { parse: [], repliedUser: false };

async function handleAfkChecks(message, prefix) {
  if (!message.guildId || message.author.bot) return;

  const content = message.content?.trim() ?? "";
  const isInvokingAfk =
    content.startsWith(prefix) &&
    /^(afk|ausente)(\s|$)/i.test(content.slice(prefix.length).trim());

  if (!isInvokingAfk) {
    const authorAfk = await getAfk(message.guildId, message.author.id);
    if (authorAfk && Date.now() - new Date(authorAfk.createdAt).getTime() >= 2500) {
      await removeAfk(message.guildId, message.author.id);
      const sinceTs = Math.floor(new Date(authorAfk.createdAt).getTime() / 1000);
      const welcomeEmbed = new EmbedBuilder()
        .setDescription(`👋 Bienvenido de vuelta ${message.author}, quité tu estado **AFK** (estuviste ausente <t:${sinceTs}:R>).`)
        .setColor(RED);

      message
        .reply({ embeds: [welcomeEmbed], allowedMentions: SAFE_MENTIONS })
        .then((sent) => setTimeout(() => sent.delete().catch(() => {}), 8000))
        .catch(() => {});
    }
  }

  if (message.mentions?.users?.size) {
    const mentioned = [...message.mentions.users.values()]
      .filter((u) => !u.bot && u.id !== message.author.id)
      .slice(0, 3);

    const afkLines = [];
    for (const targetUser of mentioned) {
      const targetAfk = await getAfk(message.guildId, targetUser.id);
      if (targetAfk) {
        const sinceTs = Math.floor(new Date(targetAfk.createdAt).getTime() / 1000);
        afkLines.push(`💤 **${targetUser.username}** está AFK (<t:${sinceTs}:R>): ${targetAfk.reason}`);
      }
    }

    if (afkLines.length > 0) {
      const afkEmbed = new EmbedBuilder()
        .setDescription(afkLines.join("\n"))
        .setColor(RED);
      await message.reply({ embeds: [afkEmbed], allowedMentions: SAFE_MENTIONS }).catch(() => {});
    }
  }
}

const event = {
  name: "messageCreate",
  once: false,
  async code(_bot, message) {
    try {
      if (message.author.bot) return;

      const prefix = message.guildId ? await getPrefix(message.guildId) : DEFAULT_PREFIX;
      await handleAfkChecks(message, prefix).catch(() => {});

      if (!message.reference?.messageId) return;

      const pregunta = message.content?.trim();
      if (!pregunta) return;

      // Evitar conflicto si el usuario está ejecutando un comando con prefijo mientras hace reply
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
