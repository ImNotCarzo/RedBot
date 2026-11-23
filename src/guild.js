const { EmbedBuilder } = require("discord.js");
const { GuildConfig, UserConfig, Log, Afk } = require("./database");
const { Logger, parsePositiveInt, withTimeout, sanitizeError } = require("./runtime");
const { isDbReady } = require("./shared/utils");

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

  has(key) {
    return this.get(key) !== undefined;
  }

  clear() {
    this.store.clear();
  }
}

const { detectLocaleLang, normalizeLang, translateEmbed } = require("./i18n");

const guildConfigCache = new TtlCache(PREFIX_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const oauthGuildLangCache = new TtlCache(10 * 60_000, 1000);
const recentWelcomeCache = new TtlCache(3 * 60_000, 500);
const userLangCache = new TtlCache(PREFIX_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const logChannelCache = new TtlCache(LOG_CACHE_TTL_MS, PREFIX_CACHE_MAX);
const afkCache = new TtlCache(AFK_CACHE_TTL_MS, AFK_CACHE_MAX);

const DEFAULT_WARN_MUTE_MS = 10 * 60 * 1000;
const VALID_LANG_SOURCES = new Set(["auto", "oauth", "manual"]);

function invalidateGuildConfigCache(guildId = null) {
  if (guildId) guildConfigCache.delete(guildId);
  else guildConfigCache.clear();
}

function patchOfflineGuildConfigCache(guildId, patch) {
  if (!guildId || !patch) return;
  const current = guildConfigCache.get(guildId) ?? {};
  guildConfigCache.set(guildId, { ...current, ...patch });
}

async function getGuildConfigCached(guildId) {
  if (!guildId) return null;
  const cached = guildConfigCache.get(guildId);
  if (cached !== undefined) return cached;
  if (!isDbReady(GuildConfig)) return null;
  try {
    const query = GuildConfig.findOne({ guildId });
    const leanQuery = typeof query?.lean === "function" ? query.lean() : query;
    const doc = await withTimeout(
      leanQuery,
      PREFIX_QUERY_TIMEOUT_MS,
      "Lectura de configuración de servidor"
    );
    const val = doc ? { ...doc } : {};
    guildConfigCache.set(guildId, val);
    return val;
  } catch {
    // Fallo transitorio de DB: cache corta para no fijar valores por defecto durante media hora
    const fallback = {};
    guildConfigCache.set(guildId, fallback, 15_000);
    return fallback;
  }
}

function detectDefaultGuildLang(guild) {
  return detectLocaleLang(guild?.preferredLocale);
}

async function getLang(guildId) {
  if (!guildId) return "es";
  const doc = await getGuildConfigCached(guildId);
  return doc?.lang === "en" ? "en" : "es";
}

async function getLangSource(guildId) {
  if (!guildId) return "auto";
  const doc = await getGuildConfigCached(guildId);
  return VALID_LANG_SOURCES.has(doc?.langSource) ? doc.langSource : "auto";
}

async function setLang(guildId, lang, { source = "manual" } = {}) {
  const resolved = normalizeLang(lang);
  const resolvedSource = VALID_LANG_SOURCES.has(source) ? source : "manual";
  if (!guildId) return resolved;
  const recent = recentWelcomeCache.get(guildId);
  if (recent) {
    recent.lang = resolved;
    recent.source = resolvedSource;
  }
  if (isDbReady(GuildConfig)) {
    try {
      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: { lang: resolved, langSource: resolvedSource } },
        { upsert: true, returnDocument: "after" }
      );
    } catch {}
    invalidateGuildConfigCache(guildId);
  } else {
    patchOfflineGuildConfigCache(guildId, { lang: resolved, langSource: resolvedSource });
  }
  return resolved;
}

function getOauthGuildLang(guildId) {
  if (!guildId) return null;
  return oauthGuildLangCache.get(guildId) ?? null;
}

function registerWelcomeCard(guildId, entry) {
  if (!guildId || !entry) return;
  recentWelcomeCache.set(guildId, entry);
}

async function applyOauthGuildLang({ guildId = null, userId = null, locale = null } = {}) {
  const detected = detectLocaleLang(locale);
  if (userId) {
    const existingUserLang = await getUserLang(userId);
    if (!existingUserLang) {
      await setUserLang(userId, detected);
    }
  }

  let updatedGuild = false;
  if (guildId) {
    oauthGuildLangCache.set(guildId, detected);
    const currentSource = await getLangSource(guildId);
    if (currentSource !== "manual") {
      const recent = recentWelcomeCache.get(guildId);
      const needsEdit = Boolean(
        recent &&
        recent.source !== "manual" &&
        recent.lang !== detected &&
        typeof recent.message?.edit === "function" &&
        typeof recent.render === "function"
      );
      await setLang(guildId, detected, { source: "oauth" });
      updatedGuild = true;
      if (needsEdit) {
        try {
          await recent.message.edit(recent.render(detected));
        } catch {}
      }
    }
  }

  return { lang: detected, updatedGuild, guildId, userId };
}

async function getUserLang(userId) {
  if (!userId) return null;
  const cached = userLangCache.get(userId);
  if (cached !== undefined) return cached;
  if (!isDbReady(UserConfig)) return null;
  try {
    const doc = await withTimeout(
      UserConfig.findOne({ userId }).select("lang").lean(),
      PREFIX_QUERY_TIMEOUT_MS,
      "Lectura de idioma de usuario"
    );
    const resolved = doc?.lang === "es" || doc?.lang === "en" ? doc.lang : null;
    userLangCache.set(userId, resolved);
    return resolved;
  } catch {
    return null;
  }
}

async function setUserLang(userId, lang) {
  const resolved = normalizeLang(lang);
  if (!userId) return resolved;
  userLangCache.set(userId, resolved);
  if (isDbReady(UserConfig)) {
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
  const doc = await getGuildConfigCached(guildId);
  return typeof doc?.aiContext === "string" ? doc.aiContext.trim() : "";
}

async function setAiContext(guildId, text) {
  const clean = typeof text === "string" ? text.trim().slice(0, 1000) : "";
  if (!guildId) return clean;
  if (isDbReady(GuildConfig)) {
    try {
      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: { aiContext: clean } },
        { upsert: true, returnDocument: "after" }
      );
    } catch {}
    invalidateGuildConfigCache(guildId);
  } else {
    patchOfflineGuildConfigCache(guildId, { aiContext: clean });
  }
  return clean;
}

async function getWarnPolicy(guildId) {
  const fallback = { warnThreshold: 0, warnMuteMs: DEFAULT_WARN_MUTE_MS };
  if (!guildId) return fallback;
  const doc = await getGuildConfigCached(guildId);
  if (!doc) return fallback;
  return {
    warnThreshold: Number.isFinite(doc.warnThreshold) ? doc.warnThreshold : 0,
    warnMuteMs: Number.isFinite(doc.warnMuteMs) && doc.warnMuteMs > 0 ? doc.warnMuteMs : DEFAULT_WARN_MUTE_MS,
  };
}

async function setWarnPolicy(guildId, { warnThreshold = 0, warnMuteMs = DEFAULT_WARN_MUTE_MS } = {}) {
  const threshold = Math.max(0, Math.min(50, Math.floor(Number(warnThreshold) || 0)));
  const muteMs = Math.max(60_000, Number(warnMuteMs) || DEFAULT_WARN_MUTE_MS);
  const policy = { warnThreshold: threshold, warnMuteMs: muteMs };
  if (!guildId) return policy;
  if (isDbReady(GuildConfig)) {
    try {
      await GuildConfig.findOneAndUpdate(
        { guildId },
        { $set: policy },
        { upsert: true, returnDocument: "after" }
      );
    } catch {}
    invalidateGuildConfigCache(guildId);
  } else {
    patchOfflineGuildConfigCache(guildId, policy);
  }
  return policy;
}

async function getPrefix(guildId) {
  if (!guildId) return DEFAULT_PREFIX;
  const doc = await getGuildConfigCached(guildId);
  return doc?.prefix || DEFAULT_PREFIX;
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
  invalidateGuildConfigCache(guildId);
  return normalized;
}

async function getAfk(guildId, userId) {
  if (!guildId || !userId) return null;
  const key = `${guildId}:${userId}`;
  const cached = afkCache.get(key);
  if (cached !== undefined) return cached;
  if (!isDbReady(Afk)) return null;
  try {
    const doc = await withTimeout(
      Afk.findOne({ guildId, userId }).lean(),
      PREFIX_QUERY_TIMEOUT_MS,
      "Lectura de AFK"
    );
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
  if (!guildId) return null;
  const cached = logChannelCache.get(guildId);
  if (cached !== undefined) return cached;
  if (!isDbReady(Log)) return null;
  try {
    const doc = await Log.findOne({ guildId }).lean();
    const channelId = doc?.channelId ?? null;
    logChannelCache.set(guildId, channelId);
    return channelId;
  } catch {
    return null;
  }
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

    let channel = guild.channels.cache.get(channelId) ?? null;
    if (!channel) {
      try {
        channel = await guild.channels.fetch(channelId);
      } catch (fetchErr) {
        if (fetchErr?.code === 10003) {
          await Log.deleteOne({ guildId: guild.id }).catch(() => {});
          logChannelCache.delete(guild.id);
        }
        return false;
      }
    }
    if (!channel) return false;

    if (!channel.isTextBased()) return false;
    const lang = await getLang(guild.id);
    const finalEmbed = lang === "en" ? translateEmbed(embed, "en") : embed;
    await channel.send({ embeds: [finalEmbed] });
    return true;
  } catch (err) {
    log.error("Error enviando log de guild", {
      guildId: guild?.id,
      action: context?.action,
      userId: context?.userId,
      err: sanitizeError(err),
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
  TtlCache,
  DEFAULT_PREFIX,
  getGuildConfigCached,
  invalidateGuildConfigCache,
  getPrefix,
  setPrefix,
  detectDefaultGuildLang,
  getLang,
  setLang,
  getOauthGuildLang,
  registerWelcomeCard,
  applyOauthGuildLang,
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
  getLogChannelId,
  setLogChannel,
  clearLogChannel,
  sendLog,
  logAction,
};
