const { REST, Routes } = require("discord.js");
const { setId } = require("../state/commandIds.store");
const { COMMANDS_TO_UPDATE } = require("../config/constants");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const READY_RETRY_ATTEMPTS = parsePositiveInt(process.env.READY_RETRY_ATTEMPTS, 5);
const READY_RETRY_BASE_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_BASE_DELAY_MS, 1500);
const READY_RETRY_MAX_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_MAX_DELAY_MS, 30000);
const READY_API_TIMEOUT_MS = parsePositiveInt(process.env.READY_API_TIMEOUT_MS, 45000);
const READY_SYNC_INITIAL_DELAY_MS = parsePositiveInt(process.env.READY_SYNC_INITIAL_DELAY_MS, 5000);
const READY_SYNC_INTERVAL_MS = parsePositiveInt(process.env.READY_SYNC_INTERVAL_MS, 900000);

const readySyncState = new WeakMap();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, taskName) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${taskName} excedió el tiempo límite (${timeoutMs}ms)`));
        }, timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runWithRetry(task, log, taskName) {
  let lastError;
  for (let attempt = 1; attempt <= READY_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      if (attempt >= READY_RETRY_ATTEMPTS) break;
      const backoff = Math.min(
        READY_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1)),
        READY_RETRY_MAX_DELAY_MS
      );
      log?.warn(`${taskName} falló (intento ${attempt}/${READY_RETRY_ATTEMPTS}), reintentando`, {
        err: err?.message ?? String(err),
        backoff,
      });
      await wait(backoff);
    }
  }
  throw lastError;
}

async function syncSlashAndContexts(client, log) {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) throw new Error("TOKEN/CLIENT_ID no disponibles para sincronización");

  await runWithRetry(
    () => withTimeout(
      client.sync(),
      READY_API_TIMEOUT_MS,
      "Sincronización de comandos slash"
    ),
    log,
    "Sincronización de comandos slash"
  );
  log?.info("Comandos slash sincronizados");

  const rest = new REST().setToken(token);
  const commands = await runWithRetry(
    () => withTimeout(
      rest.get(Routes.applicationCommands(clientId)),
      READY_API_TIMEOUT_MS,
      "Lectura de comandos de aplicación"
    ),
    log,
    "Lectura de comandos de aplicación"
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
        `Patch de contextos para ${cmd.name}`
      );
      log?.info(`Contextos actualizados: ${cmd.name}`);
    } catch (patchErr) {
      log?.error(`Error al actualizar contextos de ${cmd.name}`, { err: patchErr.message });
    }
  }
}

async function runReadySyncCycle(client, log, state) {
  if (state.running) return;
  state.running = true;
  try {
    await syncSlashAndContexts(client, log);
    state.lastSyncAt = Date.now();
  } catch (err) {
    log?.error("Fallo en ciclo de sincronización de aplicación", { err: err?.message ?? String(err) });
  } finally {
    state.running = false;
  }
}

function startReadySyncScheduler(client, log) {
  if (!client) return;
  const state = readySyncState.get(client) ?? { running: false, lastSyncAt: 0, interval: null };

  setTimeout(() => {
    runReadySyncCycle(client, log, state).catch((err) => {
      log?.error("Error inesperado en ciclo inicial de sincronización", { err: err?.message ?? String(err) });
    });
  }, READY_SYNC_INITIAL_DELAY_MS).unref();

  if (READY_SYNC_INTERVAL_MS > 0) {
    if (state.interval) clearInterval(state.interval);
    state.interval = setInterval(() => {
      runReadySyncCycle(client, log, state).catch((err) => {
        log?.error("Error inesperado en ciclo periódico de sincronización", { err: err?.message ?? String(err) });
      });
    }, READY_SYNC_INTERVAL_MS);
    state.interval.unref();
    log?.info("Scheduler de sincronización de comandos iniciado", {
      initialDelayMs: READY_SYNC_INITIAL_DELAY_MS,
      intervalMs: READY_SYNC_INTERVAL_MS,
    });
  } else {
    log?.warn("Scheduler de sincronización periódica deshabilitado por configuración", {
      READY_SYNC_INTERVAL_MS,
    });
  }

  client.once("invalidated", () => {
    const currentState = readySyncState.get(client);
    if (currentState?.interval) clearInterval(currentState.interval);
    readySyncState.delete(client);
  });

  readySyncState.set(client, state);
}

module.exports = { startReadySyncScheduler };
