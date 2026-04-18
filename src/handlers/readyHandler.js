const { REST, Routes } = require("discord.js");
const { setId } = require("../state/commandIds.store");
const { COMMANDS_TO_UPDATE } = require("../config/constants");
const { registerBotEvent } = require("./eventRuntime");
const { parsePositiveInt } = require("../utils/numbers");
const { withTimeout, sleep: wait } = require("../utils/async");

const READY_RETRY_ATTEMPTS = parsePositiveInt(process.env.READY_RETRY_ATTEMPTS, 5);
const READY_RETRY_BASE_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_BASE_DELAY_MS, 1500);
const READY_RETRY_MAX_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_MAX_DELAY_MS, 30000);
const READY_API_TIMEOUT_MS = parsePositiveInt(process.env.READY_API_TIMEOUT_MS, 45000);
const READY_SYNC_INITIAL_DELAY_MS = parsePositiveInt(process.env.READY_SYNC_INITIAL_DELAY_MS, 5000);
const READY_SYNC_INTERVAL_MS = parsePositiveInt(process.env.READY_SYNC_INTERVAL_MS, 900000);

const readySyncState = new WeakMap();

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

async function syncSlashAndContexts(client, config, log) {
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

  const rest = new REST().setToken(config.TOKEN);
  const commands = await runWithRetry(
    () => withTimeout(
      rest.get(Routes.applicationCommands(config.CLIENT_ID)),
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
          rest.patch(Routes.applicationCommand(config.CLIENT_ID, cmd.id), {
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

  log?.info("Todos los contextos actualizados");
}

async function runReadySyncCycle(client, config, log, state) {
  if (state.running) return;
  state.running = true;

  try {
    await syncSlashAndContexts(client, config, log);
    state.lastSyncAt = Date.now();
  } catch (err) {
    log?.error("Fallo en ciclo de sincronización de aplicación", { err: err?.message ?? String(err) });
  } finally {
    state.running = false;
  }
}

/**
 * Register the `clientReady` handler on the bot.
 *
 * Responsibilities:
 * - Update role-connections metadata.
 * - Sync slash commands.
 * - Patch integration_types / contexts for specific commands.
 *
 * @param {import("gralonium").Gralonium} bot
 * @param {{ TOKEN: string, CLIENT_ID: string }} config
 * @param {import("../core/logger")} [log]
 */
function registerReadyHandler(bot, config, log) {
  registerBotEvent(bot, {
    name: "clientReady",
    once: true,
    source: "handlers/readyHandler",
    async code(_bot, readyBot) {
    const client = readyBot ?? _bot;
    const state = readySyncState.get(client) ?? {
      running: false,
      lastSyncAt: 0,
      interval: null,
    };

    const delay = READY_SYNC_INITIAL_DELAY_MS;
    setTimeout(() => {
      runReadySyncCycle(client, config, log, state).catch((err) => {
        log?.error("Error inesperado en ciclo inicial de sincronización", { err: err?.message ?? String(err) });
      });
    }, delay).unref();

    const syncInterval = READY_SYNC_INTERVAL_MS;
    if (syncInterval > 0) {
      if (state.interval) clearInterval(state.interval);
      state.interval = setInterval(() => {
        runReadySyncCycle(client, config, log, state).catch((err) => {
          log?.error("Error inesperado en ciclo periódico de sincronización", { err: err?.message ?? String(err) });
        });
      }, syncInterval);
      state.interval.unref();
      log?.info("Scheduler de sincronización de comandos iniciado", {
        initialDelayMs: delay,
        intervalMs: syncInterval,
      });
    } else {
      log?.warn("Scheduler de sincronización periódica deshabilitado por configuración", {
        READY_SYNC_INTERVAL_MS: syncInterval,
      });
    }

    client.once("invalidated", () => {
      const currentState = readySyncState.get(client);
      if (currentState?.interval) clearInterval(currentState.interval);
      readySyncState.delete(client);
    });

    readySyncState.set(client, state);
    },
  }, log);
}

module.exports = { registerReadyHandler };
