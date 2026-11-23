const { EmbedBuilder } = require("discord.js");
const {
  setConversacion,
  getConversacion,
  generateChatReply,
} = require("../src/ai");
const { dispatchAutoRules, handleCustomCommandsOnMessage } = require("../src/automation");
const { handleStickyOnMessage } = require("../src/channelsExtra");
const { getPrefix, DEFAULT_PREFIX, getAfk, removeAfk, getLang, resolveContextLang, getAiContext } = require("../src/guild");
const { getMessageText } = require("../src/adapter");
const { evaluateMessageAutomod } = require("../src/moderationExtra");
const { Logger } = require("../src/runtime");
const {
  MAX_HISTORIAL,
  MAX_EMBED_DESCRIPTION,
  RED,
} = require("../src/config");
const { isValidImageAttachment } = require("../src/shared/utils");

function extractReplyImageUrl(message) {
  const att = message?.attachments?.first?.();
  return isValidImageAttachment(att) ? (att.url ?? null) : null;
}

const log = new Logger("EVENT_MESSAGE");
const TRUNCATION_SUFFIX = "\n*(respuesta recortada)*";
const SAFE_MENTIONS = { parse: [], repliedUser: false };

async function handleAfkChecks(message, prefix, botId) {
  if (!message.guildId || message.author.bot) return;

  let cachedLang = null;
  const resolveLang = async () => (cachedLang ??= await getLang(message.guildId).catch(() => "es"));

  const content = message.content?.trim() ?? "";
  let afterPrefix = null;
  if (content.startsWith(prefix)) {
    afterPrefix = content.slice(prefix.length).trim();
  } else if (botId) {
    const mentionMatch = content.match(new RegExp(`^<@!?${botId}>\\s*([\\s\\S]*)$`));
    if (mentionMatch) afterPrefix = mentionMatch[1].trim();
  }
  const isInvokingAfk = afterPrefix !== null && /^(afk|ausente)(\s|$)/i.test(afterPrefix);

  if (!isInvokingAfk) {
    const authorAfk = await getAfk(message.guildId, message.author.id);
    if (authorAfk && Date.now() - new Date(authorAfk.createdAt).getTime() >= 2500) {
      await removeAfk(message.guildId, message.author.id);
      const isEn = (await resolveLang()) === "en";
      const sinceTs = Math.floor(new Date(authorAfk.createdAt).getTime() / 1000);
      const welcomeEmbed = new EmbedBuilder()
        .setDescription(
          isEn
            ? `Welcome back ${message.author} (away for <t:${sinceTs}:R>).`
            : `Bienvenido de vuelta ${message.author} (ausente por <t:${sinceTs}:R>).`
        )
        .setColor(RED);

      message
        .reply({ embeds: [welcomeEmbed], allowedMentions: SAFE_MENTIONS })
        .then((sent) => setTimeout(() => sent.delete().catch(() => {}), 8000).unref())
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
        const isEn = (await resolveLang()) === "en";
        const sinceTs = Math.floor(new Date(targetAfk.createdAt).getTime() / 1000);
        afkLines.push(
          isEn
            ? `**${targetUser.username}** is AFK (<t:${sinceTs}:R>): ${targetAfk.reason}`
            : `**${targetUser.username}** está AFK (<t:${sinceTs}:R>): ${targetAfk.reason}`
        );
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
    if (!message?.author || message.author.bot || message.webhookId) return;

    const botId = _bot?.user?.id ?? null;

    if (message.guildId) {
      const blocked = await evaluateMessageAutomod(message).catch(() => false);
      if (blocked) return;
    }

    const prefix = message.guildId
      ? await getPrefix(message.guildId).catch(() => DEFAULT_PREFIX)
      : DEFAULT_PREFIX;
    await handleAfkChecks(message, prefix, botId).catch(() => {});

    if (message.guildId) {
      handleStickyOnMessage(message).catch(() => {});
      dispatchAutoRules("message", {
        guild: message.guild,
        message,
        member: message.member,
        channel: message.channel,
      }).catch(() => {});
      handleCustomCommandsOnMessage(message, prefix).catch(() => {});
    }

    if (!message.reference?.messageId || !botId) return;

    const rawPregunta = message.content?.trim() ?? "";
    const imageUrl = extractReplyImageUrl(message);
    if (!rawPregunta && !imageUrl) return;

    // Evitar conflicto si el usuario está ejecutando un comando con prefijo o mención mientras hace reply
    if (rawPregunta.startsWith(prefix)) return;
    if (new RegExp(`^<@!?${botId}>(?:\\s|$)`).test(rawPregunta)) return;

    const repliedMsg =
      message.channel.messages.cache.get(message.reference.messageId) ??
      (await message.channel.messages.fetch(message.reference.messageId).catch(() => null));

    // Solo procesar si el mensaje al que se responde es de este bot
    if (!repliedMsg || repliedMsg.author?.id !== botId) return;

    // Ignorar replies a embeds interactivos de menús (como /help, /user info, /server info) que tienen componentes activos
    if (repliedMsg.components?.length > 0 && !repliedMsg.embeds?.[0]?.author) return;

    try {
      await message.channel.sendTyping().catch(() => {});

      const lang = await resolveContextLang({
        guildId: message.guildId ?? null,
        userId: message.author?.id ?? null,
      });
      const isEn = lang === "en";
      const pregunta = rawPregunta || (isEn ? "Analyze this image." : "Analiza esta imagen.");
      const serverContext = message.guildId ? await getAiContext(message.guildId).catch(() => "") : "";
      const userData = getConversacion(message.author.id, message.guildId ?? "dm");
      let historial = Array.isArray(userData?.historial)
        ? [...userData.historial.slice(-MAX_HISTORIAL)]
        : [];

      // Si no había sesión activa o el usuario responde a un mensaje distinto al último guardado,
      // inyectamos el texto del mensaje respondido para que la IA sepa exactamente de qué le hablan
      const prevTexto = repliedMsg.embeds?.[0]?.description || getMessageText(repliedMsg);
      if (prevTexto) {
        const cleanPrev = prevTexto.slice(0, 1200);
        const alreadyInHistory = historial.some(
          (m) => m.role === "assistant" && m.content.includes(cleanPrev.slice(0, 80))
        );
        if (!alreadyInHistory) {
          historial.push({
            role: "user",
            content: isEn ? "(Continuation about your previous message)" : "(Continuación sobre tu mensaje anterior)",
          });
          historial.push({ role: "assistant", content: cleanPrev });
        }
      }

      historial.push({ role: "user", content: imageUrl ? `${pregunta} [imagen]` : pregunta });

      const respuesta = await generateChatReply(historial, { lang, imageUrl, serverContext });

      historial.push({ role: "assistant", content: respuesta });
      const historialFinal = historial.length > MAX_HISTORIAL
        ? historial.slice(-MAX_HISTORIAL)
        : historial;

      const suffix = isEn ? "\n*(response trimmed)*" : TRUNCATION_SUFFIX;
      const maxTexto = MAX_EMBED_DESCRIPTION - suffix.length;
      const texto = respuesta.length > maxTexto
        ? respuesta.slice(0, maxTexto) + suffix
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

      setConversacion(message.author.id, historialFinal, botMsg.id, message.guildId ?? "dm");
    } catch (err) {
      log.error("messageCreate IA", { err: err?.message ?? String(err) });
      const lang = await resolveContextLang({
        guildId: message.guildId ?? null,
        userId: message.author?.id ?? null,
      }).catch(() => "es");
      const isRateLimit = err?.status === 429 || (err?.message ?? "").includes("429");
      const errorMsg = lang === "en"
        ? (isRateLimit
            ? "AI quota reached for now. Try again in a few minutes."
            : "The AI failed to respond. Try again in a moment.")
        : (isRateLimit
            ? "Se acabó la cuota de la IA por ahora. Prueba en unos minutos."
            : "Falló la IA al responder. Intenta de nuevo en un momento.");

      await message.reply({
        content: errorMsg,
        allowedMentions: SAFE_MENTIONS,
      }).catch(() => {});
    }
  },
};

module.exports = { data: event };
