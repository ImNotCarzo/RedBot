const { EmbedBuilder } = require("discord.js");
const { GuildConfig, UserConfig, Log, Afk } = require("./database");
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

const { detectLocaleLang, normalizeLang } = require("./i18n");

const prefixCache = new TtlCache(PREFIX_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const langCache = new TtlCache(PREFIX_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const userLangCache = new TtlCache(PREFIX_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const aiContextCache = new TtlCache(PREFIX_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const warnPolicyCache = new TtlCache(PREFIX_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const logChannelCache = new TtlCache(LOG_CACHE_TTL_MS);
const afkCache = new TtlCache(AFK_CACHE_TTL_MS, AFK_CACHE_MAX);

const DEFAULT_WARN_MUTE_MS = 10 * 60 * 1000;

function detectDefaultGuildLang(guild) {
  return detectLocaleLang(guild?.preferredLocale);
}

async function getLang(guildId) {
  if (!guildId) return "es";
  const cached = langCache.get(guildId);
  if (cached) return cached;
  if (GuildConfig.db?.readyState !== 1) return "es";
  try {
    const doc = await GuildConfig.findOne({ guildId }).select("lang").lean();
    const lang = doc?.lang === "en" ? "en" : "es";
    if (doc?.lang === "es" || doc?.lang === "en") {
      langCache.set(guildId, lang);
    }
    return lang;
  } catch {
    return "es";
  }
}

async function setLang(guildId, lang) {
  const resolved = normalizeLang(lang);
  if (!guildId) return resolved;
  langCache.set(guildId, resolved);
  if (GuildConfig.db?.readyState === 1) {
    try {
      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: { lang: resolved } },
        { upsert: true, returnDocument: "after" }
      );
    } catch {}
  }
  return resolved;
}

async function getUserLang(userId) {
  if (!userId) return null;
  const cached = userLangCache.get(userId);
  if (cached) return cached;
  if (UserConfig.db?.readyState !== 1) return null;
  try {
    const doc = await UserConfig.findOne({ userId }).select("lang").lean();
    if (doc?.lang === "es" || doc?.lang === "en") {
      userLangCache.set(userId, doc.lang);
      return doc.lang;
    }
    return null;
  } catch {
    return null;
  }
}

async function setUserLang(userId, lang) {
  const resolved = normalizeLang(lang);
  if (!userId) return resolved;
  userLangCache.set(userId, resolved);
  if (UserConfig.db?.readyState === 1) {
    try {
      await UserConfig.findOneAndUpdate(
        { userId },
        { $set: { lang: resolved } },
        { upsert: true, returnDocument: "after" }
      );
    } catch {}
  }
  return resolved;
}

async function resolveContextLang({ guildId = null, userId = null, locale = null } = {}) {
  if (guildId) return getLang(guildId);
  if (userId) {
    const userLang = await getUserLang(userId);
    if (userLang) return userLang;
  }
  return detectLocaleLang(locale);
}

async function getAiContext(guildId) {
  if (!guildId) return "";
  const cached = aiContextCache.get(guildId);
  if (cached !== undefined) return cached;
  if (GuildConfig.db?.readyState !== 1) return "";
  try {
    const doc = await GuildConfig.findOne({ guildId }).select("aiContext").lean();
    const ctxText = typeof doc?.aiContext === "string" ? doc.aiContext.trim() : "";
    aiContextCache.set(guildId, ctxText);
    return ctxText;
  } catch {
    return "";
  }
}

async function setAiContext(guildId, text) {
  const clean = typeof text === "string" ? text.trim().slice(0, 1000) : "";
  if (!guildId) return clean;
  aiContextCache.set(guildId, clean);
  if (GuildConfig.db?.readyState === 1) {
    try {
      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: { aiContext: clean } },
        { upsert: true, returnDocument: "after" }
      );
    } catch {}
  }
  return clean;
}

async function getWarnPolicy(guildId) {
  const fallback = { warnThreshold: 0, warnMuteMs: DEFAULT_WARN_MUTE_MS };
  if (!guildId) return fallback;
  const cached = warnPolicyCache.get(guildId);
  if (cached) return cached;
  if (GuildConfig.db?.readyState !== 1) return fallback;
  try {
    const doc = await GuildConfig.findOne({ guildId }).select("warnThreshold warnMuteMs").lean();
    const policy = {
      warnThreshold: Number.isFinite(doc?.warnThreshold) ? doc.warnThreshold : 0,
      warnMuteMs: Number.isFinite(doc?.warnMuteMs) && doc.warnMuteMs > 0 ? doc.warnMuteMs : DEFAULT_WARN_MUTE_MS,
    };
    warnPolicyCache.set(guildId, policy);
    return policy;
  } catch {
    return fallback;
  }
}

async function setWarnPolicy(guildId, { warnThreshold = 0, warnMuteMs = DEFAULT_WARN_MUTE_MS } = {}) {
  const threshold = Math.max(0, Math.min(50, Math.floor(Number(warnThreshold) || 0)));
  const muteMs = Math.max(60_000, Number(warnMuteMs) || DEFAULT_WARN_MUTE_MS);
  const policy = { warnThreshold: threshold, warnMuteMs: muteMs };
  if (!guildId) return policy;
  warnPolicyCache.set(guildId, policy);
  if (GuildConfig.db?.readyState === 1) {
    try {
      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: policy },
        { upsert: true, returnDocument: "after" }
      );
    } catch {}
  }
  return policy;
}

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
  if (Log.db?.readyState !== 1) return null;
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
    const lang = await getLang(guild.id);
    const finalEmbed = lang === "en" ? require("./i18n").translateEmbed(embed, "en") : embed;
    await channel.send({ embeds: [finalEmbed] });
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
  detectDefaultGuildLang,
  getLang,
  setLang,
  getUserLang,
  setUserLang,
  resolveContextLang,
  getAiContext,
  setAiContext,
  getWarnPolicy,
  setWarnPolicy,
  getAfk,
  setAfk,
  removeAfk,
  setLogChannel,
  clearLogChannel,
  sendLog,
  logAction,
};
