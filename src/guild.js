const GuildConfig = require("../models/GuildConfig");
const Log = require("../models/Log");
const Logger = require("./logger");
const { parsePositiveInt, withTimeout } = require("./runtime");

const DEFAULT_PREFIX = ".";
const PREFIX_QUERY_TIMEOUT_MS = parsePositiveInt(process.env.PREFIX_QUERY_TIMEOUT_MS, 2500);
const PREFIX_CACHE_MAX = 2000;
const PREFIX_CACHE_TTL_MS = 30 * 60 * 1000;

const prefixCache = {
  store: new Map(),
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  },
  has(key) {
    return this.get(key) !== undefined;
  },
  set(key, value) {
    if (this.store.size >= PREFIX_CACHE_MAX) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + PREFIX_CACHE_TTL_MS });
  },
  delete(key) {
    return this.store.delete(key);
  },
};

function assertSnowflake(value, field) {
  if (!value || typeof value !== "string") {
    throw new TypeError(`${field} inválido`);
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
  assertSnowflake(guildId, "guildId");
  const cached = prefixCache.get(guildId);
  if (cached !== undefined) return cached;
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
  assertSnowflake(guildId, "guildId");
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

const logChannelCacheStore = new Map();
const LOG_CACHE_TTL_MS = 15 * 60 * 1000;

async function getLogChannelId(guildId) {
  assertSnowflake(guildId, "guildId");
  const cached = logChannelCacheStore.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.channelId;
  }
  const doc = await Log.findOne({ guildId }).lean();
  const channelId = doc?.channelId ?? null;
  logChannelCacheStore.set(guildId, {
    channelId,
    expiresAt: Date.now() + LOG_CACHE_TTL_MS,
  });
  return channelId;
}

async function setLogChannel(guildId, channelId) {
  assertSnowflake(guildId, "guildId");
  assertSnowflake(channelId, "channelId");
  await Log.findOneAndUpdate(
    { guildId },
    { channelId },
    { upsert: true, setDefaultsOnInsert: true }
  );
  logChannelCacheStore.set(guildId, {
    channelId,
    expiresAt: Date.now() + LOG_CACHE_TTL_MS,
  });
  return channelId;
}

async function clearLogChannel(guildId) {
  assertSnowflake(guildId, "guildId");
  const removed = await Log.findOneAndDelete({ guildId });
  logChannelCacheStore.set(guildId, {
    channelId: null,
    expiresAt: Date.now() + LOG_CACHE_TTL_MS,
  });
  return Boolean(removed);
}

async function cleanupBrokenLogChannel(guildId) {
  assertSnowflake(guildId, "guildId");
  await Log.deleteOne({ guildId });
  logChannelCacheStore.delete(guildId);
}

async function sendLog(guild, embed, context = {}) {
  try {
    if (!guild?.id || !embed) return false;
    const channelId = await getLogChannelId(guild.id);
    if (!channelId) return false;

    let channel = guild.channels.cache.get(channelId);
    if (!channel) {
      channel = await guild.channels.fetch(channelId).catch(() => null);
    }
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
