const GuildConfig = require("../../models/GuildConfig");
const prefixCache = require("../cache/prefix.cache");
const { parsePositiveInt } = require("../utils/numbers");
const { withTimeout } = require("../utils/async");

const DEFAULT_PREFIX = ".";
const PREFIX_QUERY_TIMEOUT_MS = parsePositiveInt(process.env.PREFIX_QUERY_TIMEOUT_MS, 2500);

function assertGuildId(guildId) {
  if (!guildId || typeof guildId !== "string") {
    throw new TypeError("guildId inválido");
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
  const cached = prefixCache.get(guildId);
  if (cached !== undefined) return cached;
  try {
    const doc = await withTimeout(GuildConfig.findOne({ guildId }).lean(), PREFIX_QUERY_TIMEOUT_MS, "Guild prefix read");
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
    "Guild prefix update"
  );
  prefixCache.set(guildId, normalized);
  return normalized;
}

function invalidatePrefix(guildId) {
  if (!guildId || typeof guildId !== "string") return;
  prefixCache.delete(guildId);
}

module.exports = {
  DEFAULT_PREFIX,
  getPrefix,
  setPrefix,
  invalidatePrefix,
};
