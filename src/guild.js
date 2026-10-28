const { GuildConfig, Log, Afk } = require("./database");
const { Logger, parsePositiveInt, withTimeout } = require("./runtime");

const log = new Logger("GUILD_SERVICE");

const DEFAULT_PREFIX = ".";
const PREFIX_QUERY_TIMEOUT_MS = parsePositiveInt(process.env.PREFIX_QUERY_TIMEOUT_MS, 2500);
const PREFIX_CACHE_MAX = 2000;
const PREFIX_CACHE_TTL_MS = 30 * 60 * 1000;
const LOG_CACHE_TTL_MS = 15 * 60 * 1000;
const AFK_CACHE_MAX = 5000;
const AFK_CACHE_TTL_MS = 15 * 60 * 1000;

const prefixCache = new Map();
const logChannelCache = new Map();
const afkCache = new Map();

function getCachedPrefix(guildId) {
  const entry = prefixCache.get(guildId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    prefixCache.delete(guildId);
    return undefined;
  }
  return entry.value;
}

function setCachedPrefix(guildId, value) {
  if (prefixCache.size >= PREFIX_CACHE_MAX) {
    const oldest = prefixCache.keys().next().value;
    if (oldest) prefixCache.delete(oldest);
  }
  prefixCache.set(guildId, { value, expiresAt: Date.now() + PREFIX_CACHE_TTL_MS });
}

async function getPrefix(guildId) {
  const cached = getCachedPrefix(guildId);
  if (cached !== undefined) return cached;
  try {
    const doc = await withTimeout(
      GuildConfig.findOne({ guildId }).lean(),
      PREFIX_QUERY_TIMEOUT_MS,
      "Lectura de prefijo de servidor"
    );
    const prefix = doc?.prefix ?? DEFAULT_PREFIX;
    setCachedPrefix(guildId, prefix);
    return prefix;
  } catch {
    setCachedPrefix(guildId, DEFAULT_PREFIX);
    return DEFAULT_PREFIX;
  }
}

async function setPrefix(guildId, prefix) {
  const normalized = String(prefix).trim();
  await withTimeout(
    GuildConfig.findOneAndUpdate(
      { guildId },
      { prefix: normalized },
      { upsert: true, setDefaultsOnInsert: true }
    ),
    PREFIX_QUERY_TIMEOUT_MS,
    "Actualización de prefijo de servidor"
  );
  setCachedPrefix(guildId, normalized);
  return normalized;
}

function setCachedAfk(key, value) {
  if (afkCache.size >= AFK_CACHE_MAX && !afkCache.has(key)) {
    const oldest = afkCache.keys().next().value;
    if (oldest) afkCache.delete(oldest);
  }
  afkCache.set(key, { value, expiresAt: Date.now() + AFK_CACHE_TTL_MS });
}

async function getAfk(guildId, userId) {
  if (!guildId || !userId) return null;
  const key = `${guildId}:${userId}`;
  const cached = afkCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const doc = await Afk.findOne({ guildId, userId }).lean();
    const val = doc ? { reason: doc.reason, createdAt: doc.createdAt } : null;
    setCachedAfk(key, val);
    return val;
  } catch {
    return null;
  }
}

async function setAfk(guildId, userId, reason = "AFK") {
  const cleanReason = String(reason || "AFK").trim().slice(0, 256) || "AFK";
  const now = new Date();
  const key = `${guildId}:${userId}`;
  const val = { reason: cleanReason, createdAt: now };
  setCachedAfk(key, val);
  await Afk.findOneAndUpdate(
    { guildId, userId },
    { reason: cleanReason, createdAt: now },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return val;
}

async function removeAfk(guildId, userId) {
  if (!guildId || !userId) return null;
  const key = `${guildId}:${userId}`;
  setCachedAfk(key, null);
  const removed = await Afk.findOneAndDelete({ guildId, userId }).lean().catch(() => null);
  return removed;
}

async function getLogChannelId(guildId) {
  const cached = logChannelCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.channelId;
  }
  const doc = await Log.findOne({ guildId }).lean();
  const channelId = doc?.channelId ?? null;
  logChannelCache.set(guildId, {
    channelId,
    expiresAt: Date.now() + LOG_CACHE_TTL_MS,
  });
  return channelId;
}

async function setLogChannel(guildId, channelId) {
  await Log.findOneAndUpdate(
    { guildId },
    { channelId },
    { upsert: true, setDefaultsOnInsert: true }
  );
  logChannelCache.set(guildId, {
    channelId,
    expiresAt: Date.now() + LOG_CACHE_TTL_MS,
  });
  return channelId;
}

async function clearLogChannel(guildId) {
  const removed = await Log.findOneAndDelete({ guildId });
  logChannelCache.set(guildId, {
    channelId: null,
    expiresAt: Date.now() + LOG_CACHE_TTL_MS,
  });
  return Boolean(removed);
}

async function sendLog(guild, embed, context = {}) {
  try {
    if (!guild?.id || !embed) return false;
    const channelId = await getLogChannelId(guild.id);
    if (!channelId) return false;

    const channel = guild.channels.cache.get(channelId)
      ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel) {
      await Log.deleteOne({ guildId: guild.id }).catch(() => {});
      logChannelCache.delete(guild.id);
      return false;
    }

    if (!channel.isTextBased()) return false;
    await channel.send({ embeds: [embed] });
    return true;
  } catch (err) {
    log.error("Error enviando log de guild", {
      guildId: guild?.id,
      action: context?.action,
      userId: context?.userId,
      err: err?.message ?? String(err),
    });
    return false;
  }
}

module.exports = {
  DEFAULT_PREFIX,
  getPrefix,
  setPrefix,
  getAfk,
  setAfk,
  removeAfk,
  setLogChannel,
  clearLogChannel,
  sendLog,
};
