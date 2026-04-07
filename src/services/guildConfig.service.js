const GuildConfig = require("../../models/GuildConfig");
const prefixCache = require("../cache/prefix.cache");

const DEFAULT_PREFIX = ".";

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
  if (prefixCache.has(guildId)) return prefixCache.get(guildId);
  const doc = await GuildConfig.findOne({ guildId }).lean();
  const prefix = doc?.prefix ?? DEFAULT_PREFIX;
  prefixCache.set(guildId, prefix);
  return prefix;
}

async function setPrefix(guildId, prefix) {
  assertGuildId(guildId);
  const normalized = normalizePrefix(prefix);
  await GuildConfig.findOneAndUpdate(
    { guildId },
    { prefix: normalized },
    { upsert: true, setDefaultsOnInsert: true }
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
