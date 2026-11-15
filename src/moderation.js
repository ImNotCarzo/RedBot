const crypto = require("node:crypto");
const { YELLOW } = require("./config");
const { Warn, TempBan } = require("./database");
const { getLang, getWarnPolicy, logAction } = require("./guild");
const { t } = require("./i18n");
const { Logger } = require("./runtime");

const log = new Logger("MODERATION_SERVICE");
const tempBanTimers = new Map();
const TEMPBAN_RETRY_MS = 5 * 60_000;
const MAX_TIMEOUT_MS = 2147483647;

function generateId(length = 6) {
  const size = Number.isFinite(length) ? Math.max(4, Math.min(12, Math.floor(length))) : 6;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < size; i++) {
    id += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return id;
}

function parseDuration(raw) {
  if (typeof raw !== "string") return null;
  const match = raw.trim().toLowerCase().match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return value * multipliers[match[2]];
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function addWarn({ guildId, userId, moderatorId, reason, warnId }) {
  const normalizedWarnId = String(warnId).trim().toUpperCase();
  const normalizedReason = (typeof reason === "string" ? reason.trim() : "") || "Sin razón";

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
  return Warn.findOneAndDelete({ guildId, warnId: String(warnId).trim().toUpperCase() });
}

async function clearWarnsForUser({ guildId, userId }) {
  const result = await Warn.deleteMany({ guildId, userId });
  return result.deletedCount || 0;
}

async function listWarnsForUser({ guildId, userId }) {
  return Warn.find({ guildId, userId }).sort({ createdAt: -1 });
}

async function upsertTempBan({ guildId, userId, unbanAt }) {
  const when = unbanAt instanceof Date ? unbanAt : new Date(unbanAt);
  await TempBan.findOneAndUpdate(
    { guildId, userId },
    { unbanAt: when },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return when;
}

async function listPendingTempBans() {
  return TempBan.find({}).lean();
}

function scheduleTempUnban(client, guildId, userId, unbanAt) {
  if (!client?.guilds?.fetch) return;

  const when = unbanAt instanceof Date ? unbanAt : new Date(unbanAt);
  if (Number.isNaN(when.getTime())) return;

  const key = `${guildId}:${userId}`;
  const existing = tempBanTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    tempBanTimers.delete(key);
  }

  const execute = async () => {
    let retry = false;
    try {
      const stillPending = await TempBan.exists({ guildId, userId });
      if (!stillPending) return;

      const guild = await client.guilds.fetch(guildId).catch((err) => (err?.code === 10004 ? null : undefined));
      if (guild === undefined) {
        retry = true;
        log.warn("No se pudo obtener el servidor para expirar tempban; reintentando", { guildId, userId });
        return;
      }
      if (!guild) {
        await TempBan.deleteOne({ guildId, userId }).catch(() => {});
        return;
      }

      try {
        await guild.members.unban(userId, "Tempban expirado");
      } catch (err) {
        // 10026 = Unknown Ban: el usuario ya no está baneado
        if (err?.code !== 10026) {
          retry = true;
          log.error("Fallo al desbanear; reintentando", { guildId, userId, err: err?.message ?? String(err) });
          return;
        }
      }
      await TempBan.deleteOne({ guildId, userId }).catch(() => {});
    } catch (err) {
      retry = true;
      log.error("Fallo al expirar tempban; reintentando", { guildId, userId, err: err?.message ?? String(err) });
    } finally {
      tempBanTimers.delete(key);
      if (retry) scheduleTempUnban(client, guildId, userId, new Date(Date.now() + TEMPBAN_RETRY_MS));
    }
  };

  const delay = when.getTime() - Date.now();
  if (delay <= 0) {
    execute();
    return;
  }

  const timeout = setTimeout(() => {
    if (delay > MAX_TIMEOUT_MS) scheduleTempUnban(client, guildId, userId, when);
    else execute();
  }, Math.min(delay, MAX_TIMEOUT_MS));
  timeout.unref();
  tempBanTimers.set(key, timeout);
}

async function cancelTempBan(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const timer = tempBanTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    tempBanTimers.delete(key);
  }
  await TempBan.deleteOne({ guildId, userId }).catch(() => {});
}

async function applyWarnEscalation(guild, member, totalWarns) {
  if (!guild?.id || !member?.id) return null;
  const policy = await getWarnPolicy(guild.id);
  if (!policy.warnThreshold || totalWarns < policy.warnThreshold) return null;

  const me = guild.members?.me ?? (await guild.members?.fetchMe?.().catch(() => null));
  if (me?.permissions?.has && !me.permissions.has("ModerateMembers")) return null;
  if (!member.moderatable || typeof member.timeout !== "function") return null;

  const maxDiscordTimeoutMs = 28 * 24 * 60 * 60 * 1000;
  const muteMs = Math.min(policy.warnMuteMs || 10 * 60_000, maxDiscordTimeoutMs);
  const lang = await getLang(guild.id);
  const reason = t(lang, "warn.auto_muted", { duration: formatDuration(muteMs), count: totalWarns });

  try {
    await member.timeout(muteMs, reason);
  } catch (err) {
    log.warn("No se pudo aplicar auto-mute por warns", {
      guildId: guild.id,
      userId: member.id,
      err: err?.message ?? String(err),
    });
    return null;
  }

  await logAction(guild, {
    title: lang === "en" ? "Auto-Mute Applied" : "Auto-mute aplicado",
    color: YELLOW,
    fields: [
      { name: lang === "en" ? "User" : "Usuario", value: `${member.user?.tag ?? member.id} (\`${member.id}\`)`, inline: true },
      { name: lang === "en" ? "Warnings" : "Advertencias", value: `${totalWarns}`, inline: true },
      { name: lang === "en" ? "Duration" : "Duración", value: formatDuration(muteMs), inline: true },
    ],
  }).catch(() => {});

  return { muted: true, muteMs, reason };
}

module.exports = {
  cancelTempBan,
  generateId,
  parseDuration,
  formatDuration,
  addWarn,
  applyWarnEscalation,
  removeWarnById,
  clearWarnsForUser,
  listWarnsForUser,
  upsertTempBan,
  listPendingTempBans,
  scheduleTempUnban,
};
