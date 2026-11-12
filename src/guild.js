const { EmbedBuilder } = require("discord.js");
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

class TtlCache {
  constructor(defaultTtlMs, maxEntries = Infinity) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key) {
    this.store.delete(key);
  }
}

const prefixCache = new TtlCache(PREFIX_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const logChannelCache = new TtlCache(LOG_CACHE_TTL_MS);
const afkCache = new TtlCache(AFK_CACHE_TTL_MS, AFK_CACHE_MAX);

async function getPrefix(guildId) {
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
    // Fallo transitorio de DB: cache corta para no fijar el prefijo por defecto durante media hora
    prefixCache.set(guildId, DEFAULT_PREFIX, 15_000);
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
  prefixCache.set(guildId, normalized);
  return normalized;
}

async function getAfk(guildId, userId) {
  if (!guildId || !userId) return null;
  const key = `${guildId}:${userId}`;
  const cached = afkCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const doc = await Afk.findOne({ guildId, userId }).lean();
    const val = doc ? { reason: doc.reason, createdAt: doc.createdAt } : null;
    afkCache.set(key, val);
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
  afkCache.set(key, val);
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
  afkCache.set(key, null);
  const removed = await Afk.findOneAndDelete({ guildId, userId }).lean().catch(() => null);
  return removed;
}

async function getLogChannelId(guildId) {
  const cached = logChannelCache.get(guildId);
  if (cached !== undefined) return cached;
  const doc = await Log.findOne({ guildId }).lean();
  const channelId = doc?.channelId ?? null;
  logChannelCache.set(guildId, channelId);
  return channelId;
}

async function setLogChannel(guildId, channelId) {
  await Log.findOneAndUpdate(
    { guildId },
    { channelId },
    { upsert: true, setDefaultsOnInsert: true }
  );
  logChannelCache.set(guildId, channelId);
  return channelId;
}

async function clearLogChannel(guildId) {
  const removed = await Log.findOneAndDelete({ guildId });
  logChannelCache.set(guildId, null);
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

function logAction(guild, { title = null, description = null, color = null, fields = null, footer = null, timestamp = true }, context = {}) {
  const embed = new EmbedBuilder();
  if (color != null) embed.setColor(color);
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields?.length) embed.addFields(fields);
  if (footer) embed.setFooter(typeof footer === "string" ? { text: footer } : footer);
  if (timestamp) embed.setTimestamp();
  return module.exports.sendLog(guild, embed, context);
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
  logAction,
};
