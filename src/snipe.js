const SNIPE_TTL_MS = 30 * 60 * 1000;
const MAX_SNIPE_CHANNELS = 1000;
const MAX_SNIPES_PER_CHANNEL = 100;
const snipes = new Map();

function purgeChannelExpired(list, now = Date.now()) {
  return list.filter((entry) => now - entry.deletedAt <= SNIPE_TTL_MS);
}

function purgeExpired() {
  const now = Date.now();
  for (const [channelId, list] of snipes.entries()) {
    const valid = purgeChannelExpired(list, now);
    if (!valid.length) snipes.delete(channelId);
    else snipes.set(channelId, valid);
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

  if (snipes.size >= MAX_SNIPE_CHANNELS && !snipes.has(message.channelId)) {
    purgeExpired();
    if (snipes.size >= MAX_SNIPE_CHANNELS) {
      const oldest = snipes.keys().next().value;
      if (oldest !== undefined) snipes.delete(oldest);
    }
  }

  const prev = purgeChannelExpired(snipes.get(message.channelId) ?? []);
  prev.unshift({
    content,
    authorId: message.author?.id ?? null,
    authorTag: message.author?.tag ?? message.author?.username ?? "Desconocido",
    authorName: message.member?.displayName ?? message.author?.globalName ?? message.author?.username ?? "Desconocido",
    authorAvatar: message.author?.displayAvatarURL?.({ size: 256 }) ?? null,
    attachmentUrl,
    deletedAt: Date.now(),
  });
  if (prev.length > MAX_SNIPES_PER_CHANNEL) prev.length = MAX_SNIPES_PER_CHANNEL;

  snipes.delete(message.channelId);
  snipes.set(message.channelId, prev);
  return true;
}

function listSnipedMessages(channelId) {
  if (!channelId) return [];
  const raw = snipes.get(channelId);
  if (!raw?.length) return [];

  const valid = purgeChannelExpired(raw);
  if (!valid.length) {
    snipes.delete(channelId);
    return [];
  }
  if (valid.length !== raw.length) snipes.set(channelId, valid);
  return valid;
}

function getSnipedMessage(channelId, index = 0) {
  const list = listSnipedMessages(channelId);
  if (!list.length) return null;
  const idx = Math.max(0, Math.min(list.length - 1, Math.floor(Number(index) || 0)));
  return list[idx] ?? null;
}

module.exports = {
  SNIPE_TTL_MS,
  MAX_SNIPES_PER_CHANNEL,
  recordDeletedMessage,
  listSnipedMessages,
  getSnipedMessage,
};
