const crypto = require("node:crypto");
const { YELLOW } = require("./config");
const { Warn, TempBan, ModCase } = require("./database");
const { getLang, getWarnPolicy, logAction } = require("./guild");
const { t } = require("./i18n");
const { Logger } = require("./runtime");
const { clearTimerMap, fetchBotMember, isDbReady } = require("./shared/utils");

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

async function addModCase({ guildId, userId, moderatorId, type, reason = "Sin razón", durationMs = null, caseId = null }) {
  if (!guildId || !userId || !moderatorId || !type) return null;
  if (!isDbReady(ModCase)) return null;
  const normalizedReason = (typeof reason === "string" ? reason.trim() : "") || "Sin razón";
  const resolvedCaseId = String(caseId || generateId()).trim().toUpperCase();
  try {
    return await ModCase.create({
      guildId,
      userId,
      moderator: moderatorId,
      type,
      reason: normalizedReason.slice(0, 500),
      durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null,
      caseId: resolvedCaseId,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return ModCase.create({
        guildId,
        userId,
        moderator: moderatorId,
        type,
        reason: normalizedReason.slice(0, 500),
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null,
        caseId: generateId(7),
      }).catch(() => null);
    }
    log.warn("No se pudo guardar ModCase", { guildId, userId, type, err: err?.message ?? String(err) });
    return null;
  }
}

async function listModCasesForUser({ guildId, userId }) {
  if (!guildId || !userId || !isDbReady(ModCase)) return [];
  const q = ModCase.find({ guildId, userId }).sort({ createdAt: -1 });
  return typeof q?.lean === "function" ? q.lean() : q;
}

async function listUnifiedHistoryForUser({ guildId, userId }) {
  const fetchWarns = async () => {
    if (!isDbReady(Warn)) return [];
    const q = Warn.find({ guildId, userId }).sort({ createdAt: -1 });
    return typeof q?.lean === "function" ? q.lean() : q;
  };
  const [cases, warns] = await Promise.all([
    listModCasesForUser({ guildId, userId }).catch(() => []),
    fetchWarns().catch(() => []),
  ]);

  const seenWarnIds = new Set(
    cases.filter((c) => c.type === "warn" && c.caseId).map((c) => String(c.caseId).toUpperCase())
  );

  const legacyWarns = warns
    .filter((w) => !seenWarnIds.has(String(w.warnId ?? "").toUpperCase()))
    .map((w) => ({
      guildId: w.guildId,
      userId: w.userId,
      moderator: w.moderator,
      type: "warn",
      reason: w.reason,
      durationMs: null,
      caseId: w.warnId,
      createdAt: w.createdAt,
      legacyWarn: true,
    }));

  return [...cases, ...legacyWarns].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

async function addWarn({ guildId, userId, moderatorId, reason, warnId }) {
  const normalizedReason = (typeof reason === "string" ? reason.trim() : "") || "Sin razón";
  let normalizedWarnId = String(warnId || generateId()).trim().toUpperCase();

  try {
    await Warn.create({
      guildId,
      userId,
      moderator: moderatorId,
      reason: normalizedReason,
      warnId: normalizedWarnId,
    });
  } catch (err) {
    if (err?.code === 11000 && !warnId) {
      normalizedWarnId = generateId(7);
      await Warn.create({
        guildId,
        userId,
        moderator: moderatorId,
        reason: normalizedReason,
        warnId: normalizedWarnId,
      });
    } else {
      throw err;
    }
  }

  await addModCase({
    guildId,
    userId,
    moderatorId,
    type: "warn",
    reason: normalizedReason,
    caseId: normalizedWarnId,
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

const MAX_TEMPBAN_PERM_RETRIES = 3;

function stopTempBanTimers() {
  clearTimerMap(tempBanTimers);
}

function scheduleTempUnban(client, guildId, userId, unbanAt, permAttempt = 0) {
  if (!client?.guilds?.fetch) return;

  const when = unbanAt instanceof Date ? unbanAt : new Date(unbanAt);
  if (Number.isNaN(when.getTime())) return;

  const key = `${guildId}:${userId}`;
  clearTimerMap(tempBanTimers, key);

  const execute = async () => {
    let retry = false;
    let nextPermAttempt = permAttempt;
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
        // 10026 = Unknown Ban, 10013 = Unknown User (no reintentables)
        if (err?.code === 10026 || err?.code === 10013) {
          // Ya no existe el ban o el usuario
        } else if (err?.code === 50013 && permAttempt >= MAX_TEMPBAN_PERM_RETRIES) {
          log.error("Fallo de permisos persistente al desbanear; descartando reintento", { guildId, userId });
        } else {
          retry = true;
          if (err?.code === 50013) nextPermAttempt = permAttempt + 1;
          log.error("Fallo al desbanear; reintentando", { guildId, userId, err: err?.message ?? String(err) });
          return;
        }
      }
      await TempBan.deleteOne({ guildId, userId }).catch(() => {});
    } catch (err) {
      retry = true;
      log.error("Fallo al expirar tempban; reintentando", { guildId, userId, err: err?.message ?? String(err) });
    } finally {
      if (retry && !tempBanTimers.has(key)) {
        scheduleTempUnban(client, guildId, userId, new Date(Date.now() + TEMPBAN_RETRY_MS), nextPermAttempt);
      }
    }
  };

  const delay = when.getTime() - Date.now();
  if (delay <= 0) {
    execute();
    return;
  }

  const timeout = setTimeout(() => {
    if (tempBanTimers.get(key) !== timeout) return;
    tempBanTimers.delete(key);
    if (delay > MAX_TIMEOUT_MS) scheduleTempUnban(client, guildId, userId, when, permAttempt);
    else execute();
  }, Math.min(delay, MAX_TIMEOUT_MS));
  timeout.unref();
  tempBanTimers.set(key, timeout);
}

async function cancelTempBan(guildId, userId) {
  const key = `${guildId}:${userId}`;
  clearTimerMap(tempBanTimers, key);
  await TempBan.deleteOne({ guildId, userId }).catch(() => {});
}

async function applyWarnEscalation(guild, member, totalWarns) {
  if (!guild?.id || !member?.id) return null;
  const policy = await getWarnPolicy(guild.id);
  if (!policy.warnThreshold || totalWarns < policy.warnThreshold) return null;

  const me = await fetchBotMember(guild);
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

  await addModCase({
    guildId: guild.id,
    userId: member.id,
    moderatorId: guild.client?.user?.id ?? "auto",
    type: "auto_mute",
    reason,
    durationMs: muteMs,
  });

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
  stopTempBanTimers,
  generateId,
  parseDuration,
  formatDuration,
  addModCase,
  listUnifiedHistoryForUser,
  addWarn,
  applyWarnEscalation,
  removeWarnById,
  clearWarnsForUser,
  upsertTempBan,
  listPendingTempBans,
  scheduleTempUnban,
};
