const { ActivityType, REST, Routes } = require("discord.js");
const { scheduleTempUnban, listPendingTempBans } = require("../src/moderation");
const Logger = require("../src/logger");
const { sanitizeError, parsePositiveInt, withTimeout, runWithRetry } = require("../src/runtime");
const { setId } = require("../src/commandIds");
const { COMMANDS_TO_UPDATE } = require("../src/config");

const log = new Logger("EVENT_READY", process.env.LOG_LEVEL);
const presenceIntervals = new WeakMap();
const recoveryTimers = new WeakMap();
const lifecycleBound = new WeakSet();
const readySyncState = new WeakMap();

const GATEWAY_RECOVERY_GRACE_MS = parsePositiveInt(process.env.GATEWAY_RECOVERY_GRACE_MS, 120000);
const READY_RETRY_ATTEMPTS = parsePositiveInt(process.env.READY_RETRY_ATTEMPTS, 5);
const READY_RETRY_BASE_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_BASE_DELAY_MS, 1500);
const READY_RETRY_MAX_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_MAX_DELAY_MS, 30000);
const READY_API_TIMEOUT_MS = parsePositiveInt(process.env.READY_API_TIMEOUT_MS, 45000);
const READY_SYNC_INITIAL_DELAY_MS = parsePositiveInt(process.env.READY_SYNC_INITIAL_DELAY_MS, 5000);
const READY_SYNC_INTERVAL_MS = parsePositiveInt(process.env.READY_SYNC_INTERVAL_MS, 900000);

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
    const currentState = readySyncState.get(client);
    if (currentState?.interval) clearInterval(currentState.interval);
    readySyncState.delete(client);
    scheduleRecoveryExit(client, "invalidated");
    log.warn("Sesión invalidada detectada");
  });
}

async function syncSlashAndContexts(client) {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;

  await runWithRetry(
    () => withTimeout(client.sync(), READY_API_TIMEOUT_MS, "Sincronización de comandos slash"),
    log,
    "Sincronización de comandos slash",
    READY_RETRY_ATTEMPTS,
    READY_RETRY_BASE_DELAY_MS,
    READY_RETRY_MAX_DELAY_MS
  );
  log.info("Comandos slash sincronizados");

  const rest = new REST().setToken(token);
  const commands = await runWithRetry(
    () => withTimeout(
      rest.get(Routes.applicationCommands(clientId)),
      READY_API_TIMEOUT_MS,
      "Lectura de comandos de aplicación"
    ),
    log,
    "Lectura de comandos de aplicación",
    READY_RETRY_ATTEMPTS,
    READY_RETRY_BASE_DELAY_MS,
    READY_RETRY_MAX_DELAY_MS
  );

  for (const cmd of commands) {
    setId(cmd.name, cmd.id);
  }

  for (const cmd of commands) {
    if (!COMMANDS_TO_UPDATE.includes(cmd.name)) continue;

    try {
      await runWithRetry(
        () => withTimeout(
          rest.patch(Routes.applicationCommand(clientId, cmd.id), {
            body: {
              integration_types: [0, 1],
              contexts: [0, 1, 2],
            },
          }),
          READY_API_TIMEOUT_MS,
          `Patch de contextos para ${cmd.name}`
        ),
        log,
        `Patch de contextos para ${cmd.name}`,
        READY_RETRY_ATTEMPTS,
        READY_RETRY_BASE_DELAY_MS,
        READY_RETRY_MAX_DELAY_MS
      );
      log.info(`Contextos actualizados: ${cmd.name}`);
    } catch (patchErr) {
      log.error(`Error al actualizar contextos de ${cmd.name}`, { err: patchErr.message });
    }
  }

  log.info("Todos los contextos actualizados");
}

async function runReadySyncCycle(client, state) {
  if (state.running) return;
  state.running = true;

  try {
    await syncSlashAndContexts(client);
    state.lastSyncAt = Date.now();
  } catch (err) {
    log.error("Fallo en ciclo de sincronización de aplicación", { err: err?.message ?? String(err) });
  } finally {
    state.running = false;
  }
}

function startCommandSync(client) {
  const state = readySyncState.get(client) ?? {
    running: false,
    lastSyncAt: 0,
    interval: null,
  };

  setTimeout(() => {
    runReadySyncCycle(client, state).catch((err) => {
      log.error("Error inesperado en ciclo inicial de sincronización", { err: err?.message ?? String(err) });
    });
  }, READY_SYNC_INITIAL_DELAY_MS).unref();

  if (READY_SYNC_INTERVAL_MS > 0) {
    if (state.interval) clearInterval(state.interval);
    state.interval = setInterval(() => {
      runReadySyncCycle(client, state).catch((err) => {
        log.error("Error inesperado en ciclo periódico de sincronización", { err: err?.message ?? String(err) });
      });
    }, READY_SYNC_INTERVAL_MS);
    state.interval.unref();
    log.info("Scheduler de sincronización de comandos iniciado", {
      initialDelayMs: READY_SYNC_INITIAL_DELAY_MS,
      intervalMs: READY_SYNC_INTERVAL_MS,
    });
  } else {
    log.warn("Scheduler de sincronización periódica deshabilitado por configuración", {
      READY_SYNC_INTERVAL_MS,
    });
  }

  readySyncState.set(client, state);
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

    await restoreTempBans(client);

    const getActivities = () => [
      `${client.guilds.cache.size} servidores`,
      `${client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0)} usuarios`,
      "/help",
    ];

    clearPresenceInterval(client);
    clearRecoveryTimer(client);
    bindGatewayLifecycle(client);
    startCommandSync(client);

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
