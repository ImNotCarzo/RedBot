const { ActivityType } = require("discord.js");
const { scheduleTempUnban, listPendingTempBans } = require("../src/services/moderation.service");
const { startReadySyncScheduler } = require("../src/services/readySync.service");
const Logger = require("../src/core/logger");
const { sanitizeError } = require("../src/handlers/eventRuntime");

const log = new Logger("EVENT_READY", process.env.LOG_LEVEL);
const presenceIntervals = new WeakMap();
const recoveryTimers = new WeakMap();
const lifecycleBound = new WeakSet();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// If Discord gateway/session does not recover within this grace window, the
// process exits so external supervisors (Pterodactyl/PM2/systemd) can restart it.
const GATEWAY_RECOVERY_GRACE_MS = parsePositiveInt(process.env.GATEWAY_RECOVERY_GRACE_MS, 120000);

async function restoreTempBans(client) {
  try {
    if (!client?.guilds) return;
    const pending = await listPendingTempBans();
    if (!pending.length) return;

    log.info(`Restaurando ${pending.length} tempban(s)...`);
    for (const entry of pending) {
      try {
        if (!entry?.guildId || !entry?.userId || !entry?.unbanAt) continue;
        scheduleTempUnban(client, entry.guildId, entry.userId, entry.unbanAt);
      } catch (err) {
        log.warn("Tempban inválido omitido", {
          guildId: entry?.guildId,
          userId: entry?.userId,
          err: sanitizeError(err),
        });
      }
    }
    log.info("Tempbans restaurados.");
  } catch (err) {
    log.error("Error al restaurar tempbans", { err: sanitizeError(err) });
  }
}

function clearRecoveryTimer(client) {
  const timer = recoveryTimers.get(client);
  if (!timer) return;
  clearTimeout(timer);
  recoveryTimers.delete(client);
}

function clearPresenceInterval(client) {
  const current = presenceIntervals.get(client);
  if (current) clearInterval(current);
  presenceIntervals.delete(client);
}

function scheduleRecoveryExit(client, reason, meta = {}) {
  if (recoveryTimers.has(client)) return;
  const timeoutMs = GATEWAY_RECOVERY_GRACE_MS;
  log.warn("Gateway degradado, programando reinicio del proceso", { reason, timeoutMs, ...meta });

  const timer = setTimeout(() => {
    log.error("Reinicio forzado por sesión inestable de Discord", { reason, ...meta });
    process.exit(1);
  }, timeoutMs);
  timer.unref();
  recoveryTimers.set(client, timer);
}

function bindGatewayLifecycle(client) {
  if (lifecycleBound.has(client)) return;
  lifecycleBound.add(client);

  client.on("shardDisconnect", (event, shardId) => {
    log.warn("Shard desconectado", {
      shardId,
      code: event?.code ?? null,
      reason: event?.reason ?? "unknown",
    });
    scheduleRecoveryExit(client, "shardDisconnect", {
      shardId,
      code: event?.code ?? null,
    });
  });

  client.on("shardError", (error, shardId) => {
    log.error("Error de shard", {
      shardId,
      err: sanitizeError(error),
    });
  });

  client.on("shardReconnecting", (shardId) => {
    log.warn("Shard reconectando", { shardId });
  });

  client.on("shardResume", (_replayedEvents, shardId) => {
    log.info("Shard reanudado", { shardId });
    clearRecoveryTimer(client);
  });

  client.on("shardReady", (shardId) => {
    log.info("Shard listo", { shardId });
    clearRecoveryTimer(client);
  });

  client.once("invalidated", () => {
    clearPresenceInterval(client);
    scheduleRecoveryExit(client, "invalidated");
    log.warn("Sesión invalidada detectada");
  });
}

const event = {
  name: "clientReady",
  once: true,
  async code(bot, readyBot) {
    const client = readyBot ?? bot;
    if (!client?.user) {
      log.warn("clientReady sin usuario inicializado");
      return;
    }

    log.info(`${client.user.username} ready`, {
      guilds: client.guilds?.cache?.size ?? 0,
    });

    startReadySyncScheduler(client, log);
    await restoreTempBans(client);

    const getActivities = () => [
      `${client.guilds.cache.size} servidores`,
      `${client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0)} usuarios`,
      "/help",
    ];

    clearPresenceInterval(client);
    clearRecoveryTimer(client);
    bindGatewayLifecycle(client);

    let i = 0;
    const interval = setInterval(() => {
      try {
        const activities = getActivities();
        client.user.setPresence({
          activities: [{ name: activities[i], type: ActivityType.Watching }],
          status: "dnd",
        });
        i = (i + 1) % activities.length;
      } catch (err) {
        log.error("Error al actualizar presencia", { err: sanitizeError(err) });
        clearPresenceInterval(client);
      }
    }, 10000);
    presenceIntervals.set(client, interval);
  },
};

module.exports = { data: event };
