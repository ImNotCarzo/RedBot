const GuildConfig = require("../../models/GuildConfig");
const prefixCache = require("../cache/prefix.cache");

const DEFAULT_PREFIX = ".";
function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const PREFIX_QUERY_TIMEOUT_MS = parsePositiveInt(process.env.PREFIX_QUERY_TIMEOUT_MS, 2500);

function timeoutError(operation, timeoutMs) {
  return new Error(`${operation} excedió el tiempo límite (${timeoutMs}ms)`);
}

async function withTimeout(promise, operation, timeoutMs = PREFIX_QUERY_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(operation, timeoutMs)), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  try {
    const doc = await withTimeout(
      GuildConfig.findOne({ guildId }).lean(),
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
    "Actualización de prefijo de servidor"
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
