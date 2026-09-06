const GuildConfig = require("../models/GuildConfig");
const Log = require("../models/Log");
const Logger = require("./logger");
const { parsePositiveInt, withTimeout } = require("./runtime");

const DEFAULT_PREFIX = ".";
const PREFIX_QUERY_TIMEOUT_MS = parsePositiveInt(process.env.PREFIX_QUERY_TIMEOUT_MS, 2500);
const PREFIX_CACHE_MAX = 2000;
const PREFIX_CACHE_TTL_MS = 30 * 60 * 1000;

const prefixCacheStore = new Map();
const log = new Logger("GUILD_LOG", process.env.LOG_LEVEL);

function isExpired(entry) {
  return !entry || entry.expiresAt <= Date.now();
}

function prunePrefixCache() {
  for (const [key, entry] of prefixCacheStore.entries()) {
    if (isExpired(entry)) prefixCacheStore.delete(key);
  }
}

function evictPrefixCache() {
  prunePrefixCache();
  while (prefixCacheStore.size >= PREFIX_CACHE_MAX) {
    const oldestKey = prefixCacheStore.keys().next().value;
    if (!oldestKey) break;
    prefixCacheStore.delete(oldestKey);
  }
}

const prefixCache = {
  get(key) {
    const entry = prefixCacheStore.get(key);
    if (!entry) return undefined;
    if (isExpired(entry)) {
      prefixCacheStore.delete(key);
      return undefined;
    }
    prefixCacheStore.delete(key);
    prefixCacheStore.set(key, entry);
    return entry.value;
  },
  has(key) {
    return prefixCache.get(key) !== undefined;
  },
  set(key, value) {
    evictPrefixCache();
    prefixCacheStore.set(key, { value, expiresAt: Date.now() + PREFIX_CACHE_TTL_MS });
  },
  delete(key) {
    return prefixCacheStore.delete(key);
  },
};

function assertGuildId(guildId) {
  if (!guildId || typeof guildId !== "string") {
    throw new TypeError("guildId inválido");
  }
}

function assertChannelId(channelId) {
  if (!channelId || typeof channelId !== "string") {
    throw new TypeError("channelId inválido");
  }
}

function normalizePrefix(prefix) {
  if (typeof prefix !== "string") throw new TypeError("prefix debe ser string");
  const value = prefix.trim();
  if (!value) throw new TypeError("prefix vacío");
  if (value.length > 3) throw new TypeError("prefix excede longitud máxima");
  return value;
}

async function getPrefix(guildId) {
  assertGuildId(guildId);
  if (prefixCache.has(guildId)) return prefixCache.get(guildId);
  try {
    const doc = await withTimeout(
      GuildConfig.findOne({ guildId }).lean(),
      PREFIX_QUERY_TIMEOUT_MS,
      "Lectura de prefijo de servidor"
    );
    const prefix = doc?.prefix ?? DEFAULT_PREFIX;
    prefixCache.set(guildId, prefix);
    return prefix;
  } catch {
    prefixCache.set(guildId, DEFAULT_PREFIX);
    return DEFAULT_PREFIX;
  }
}

async function setPrefix(guildId, prefix) {
  assertGuildId(guildId);
  const normalized = normalizePrefix(prefix);
  await withTimeout(
    GuildConfig.findOneAndUpdate(
      { guildId },
      { prefix: normalized },
      { upsert: true, setDefaultsOnInsert: true }
    ),
    PREFIX_QUERY_TIMEOUT_MS,
    "Actualización de prefijo de servidor"
  );
  prefixCache.set(guildId, normalized);
  return normalized;
}

async function getLogChannelId(guildId) {
  assertGuildId(guildId);
  const doc = await Log.findOne({ guildId }).lean();
  return doc?.channelId ?? null;
}

async function setLogChannel(guildId, channelId) {
  assertGuildId(guildId);
  assertChannelId(channelId);
  await Log.findOneAndUpdate(
    { guildId },
    { channelId },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return channelId;
}

async function clearLogChannel(guildId) {
  assertGuildId(guildId);
  const removed = await Log.findOneAndDelete({ guildId });
  return Boolean(removed);
}

async function cleanupBrokenLogChannel(guildId) {
  assertGuildId(guildId);
  await Log.deleteOne({ guildId });
}

async function sendLog(guild, embed, context = {}) {
  try {
    if (!guild?.id || !embed) return false;
    const channelId = await getLogChannelId(guild.id);
    if (!channelId) return false;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      await cleanupBrokenLogChannel(guild.id).catch(() => {});
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
  prefixCache,
  getPrefix,
  setPrefix,
  getLogChannelId,
  setLogChannel,
  clearLogChannel,
  cleanupBrokenLogChannel,
  sendLog,
};
