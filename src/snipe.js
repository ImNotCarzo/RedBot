const SNIPE_TTL_MS = 3 * 60 * 1000;
const MAX_SNIPE_CHANNELS = 1000;
const snipes = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [channelId, entry] of snipes.entries()) {
    if (now - entry.deletedAt > SNIPE_TTL_MS) {
      snipes.delete(channelId);
    }
  }
}

function getSnipeImageAttachment(message) {
  const attachments = [...(message?.attachments?.values?.() ?? [])];
  for (const att of attachments) {
    const type = att?.contentType ?? "";
    const name = att?.name ?? "";
    if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(name)) {
      return att.url ?? att.proxyURL ?? null;
    }
  }
  return null;
}

function recordDeletedMessage(message) {
  if (!message?.guildId || !message?.channelId || message.author?.bot) return false;

  const content = message.content?.trim() ?? "";
  const attachmentUrl = getSnipeImageAttachment(message);
  if (!content && !attachmentUrl) return false;

  if (snipes.size >= MAX_SNIPE_CHANNELS) {
    purgeExpired();
    if (snipes.size >= MAX_SNIPE_CHANNELS) {
      const oldest = snipes.keys().next().value;
      if (oldest !== undefined) snipes.delete(oldest);
    }
  }

  snipes.delete(message.channelId);
  snipes.set(message.channelId, {
    content,
    authorId: message.author?.id ?? null,
    authorTag: message.author?.tag ?? message.author?.username ?? "Desconocido",
    authorName: message.member?.displayName ?? message.author?.globalName ?? message.author?.username ?? "Desconocido",
    authorAvatar: message.author?.displayAvatarURL?.({ size: 256 }) ?? null,
    attachmentUrl,
    deletedAt: Date.now(),
  });
  return true;
}

function getSnipedMessage(channelId) {
  if (!channelId) return null;
  const entry = snipes.get(channelId);
  if (!entry) return null;

  if (Date.now() - entry.deletedAt > SNIPE_TTL_MS) {
    snipes.delete(channelId);
    return null;
  }
  return entry;
}

module.exports = {
  SNIPE_TTL_MS,
  recordDeletedMessage,
  getSnipedMessage,
};
