const Warn = require("../../models/Warn");
const TempBan = require("../../models/TempBan");
const Logger = require("../core/logger");

const log = new Logger("MODERATION_SERVICE", process.env.LOG_LEVEL);
const tempBanTimers = new Map();

function assertSnowflake(value, field) {
  if (!value || typeof value !== "string") throw new TypeError(`${field} inválido`);
}

function normalizeReason(reason) {
  const value = typeof reason === "string" ? reason.trim() : "";
  return value || "Sin razón";
}

function normalizeWarnId(warnId) {
  if (typeof warnId !== "string") throw new TypeError("warnId inválido");
  const normalized = warnId.trim().toUpperCase();
  if (!normalized) throw new TypeError("warnId vacío");
  return normalized;
}

function getTempBanKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

async function addWarn({ guildId, userId, moderatorId, reason, warnId }) {
  assertSnowflake(guildId, "guildId");
  assertSnowflake(userId, "userId");
  assertSnowflake(moderatorId, "moderatorId");
  const normalizedWarnId = normalizeWarnId(warnId);
  const normalizedReason = normalizeReason(reason);

  await Warn.create({
    guildId,
    userId,
    moderator: moderatorId,
    reason: normalizedReason,
    warnId: normalizedWarnId,
  });

  const total = await Warn.countDocuments({ guildId, userId });
  return { warnId: normalizedWarnId, total };
}

async function removeWarnById({ guildId, warnId }) {
  assertSnowflake(guildId, "guildId");
  const normalizedWarnId = normalizeWarnId(warnId);
  return Warn.findOneAndDelete({ guildId, warnId: normalizedWarnId });
}

async function clearWarnsForUser({ guildId, userId }) {
  assertSnowflake(guildId, "guildId");
  assertSnowflake(userId, "userId");
  const result = await Warn.deleteMany({ guildId, userId });
  return result.deletedCount || 0;
}

async function listWarnsForUser({ guildId, userId }) {
  assertSnowflake(guildId, "guildId");
  assertSnowflake(userId, "userId");
  return Warn.find({ guildId, userId }).sort({ createdAt: -1 });
}

async function upsertTempBan({ guildId, userId, unbanAt }) {
  assertSnowflake(guildId, "guildId");
  assertSnowflake(userId, "userId");
  const when = unbanAt instanceof Date ? unbanAt : new Date(unbanAt);
  if (Number.isNaN(when.getTime())) throw new TypeError("unbanAt inválido");

  await TempBan.findOneAndUpdate(
    { guildId, userId },
    { unbanAt: when },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return when;
}

async function removeTempBan({ guildId, userId }) {
  assertSnowflake(guildId, "guildId");
  assertSnowflake(userId, "userId");
  await TempBan.deleteOne({ guildId, userId });
}

async function hasTempBan({ guildId, userId }) {
  assertSnowflake(guildId, "guildId");
  assertSnowflake(userId, "userId");
  const doc = await TempBan.findOne({ guildId, userId }).lean();
  return Boolean(doc);
}

async function listPendingTempBans() {
  return TempBan.find({}).lean();
}

function clearScheduledTempBan(guildId, userId) {
  const key = getTempBanKey(guildId, userId);
  const existing = tempBanTimers.get(key);
  if (!existing) return;
  clearTimeout(existing);
  tempBanTimers.delete(key);
}

function scheduleTempUnban(client, guildId, userId, unbanAt) {
  assertSnowflake(guildId, "guildId");
  assertSnowflake(userId, "userId");
  if (!client?.guilds?.fetch) throw new TypeError("client inválido");

  const when = unbanAt instanceof Date ? unbanAt : new Date(unbanAt);
  if (Number.isNaN(when.getTime())) throw new TypeError("unbanAt inválido");

  const key = getTempBanKey(guildId, userId);
  clearScheduledTempBan(guildId, userId);

  const execute = async () => {
    try {
      const stillPending = await hasTempBan({ guildId, userId });
      if (!stillPending) return;

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        await removeTempBan({ guildId, userId }).catch(() => {});
        return;
      }

      await guild.members.unban(userId, "Tempban expirado").catch(() => {});
      await removeTempBan({ guildId, userId }).catch(() => {});
    } catch (err) {
      log.error("Fallo al expirar tempban", { guildId, userId, err: err?.message ?? String(err) });
      await removeTempBan({ guildId, userId }).catch(() => {});
    } finally {
      tempBanTimers.delete(key);
    }
  };

  const delay = when.getTime() - Date.now();
  if (delay <= 0) {
    execute().catch((err) => {
      log.error("Fallo inesperado al ejecutar tempban inmediato", { guildId, userId, err: err?.message ?? String(err) });
    });
    return;
  }

  const timeout = setTimeout(() => {
    execute().catch((err) => {
      log.error("Fallo inesperado al ejecutar tempban programado", { guildId, userId, err: err?.message ?? String(err) });
    });
  }, delay);
  timeout.unref();
  tempBanTimers.set(key, timeout);
}

module.exports = {
  addWarn,
  removeWarnById,
  clearWarnsForUser,
  listWarnsForUser,
  upsertTempBan,
  removeTempBan,
  hasTempBan,
  listPendingTempBans,
  scheduleTempUnban,
  clearScheduledTempBan,
  normalizeReason,
  normalizeWarnId,
};
