const { REST, Routes } = require("discord.js");
const { setId }        = require("../state/commandIds.store");
const { COMMANDS_TO_UPDATE } = require("../config/constants");
const { registerBotEvent } = require("./eventRuntime");
const ROLE_CONNECTION_TIMEOUT_MS = 10_000;
const READY_RETRY_ATTEMPTS = 3;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetry(task, log, taskName) {
  let lastError;
  for (let attempt = 1; attempt <= READY_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      if (attempt >= READY_RETRY_ATTEMPTS) break;
      const backoff = 800 * (2 ** (attempt - 1));
      log?.warn(`${taskName} falló (intento ${attempt}/${READY_RETRY_ATTEMPTS}), reintentando`, {
        err: err?.message ?? String(err),
        backoff,
      });
      await wait(backoff);
    }
  }
  throw lastError;
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

    // ── Role-connections metadata ─────────────────────────────────────────
    try {
      await runWithRetry(async () => {
        const res = await fetch(
          `https://discord.com/api/v10/applications/${config.CLIENT_ID}/role-connections/metadata`,
          {
            method:  "PUT",
            headers: {
              Authorization:  `Bot ${config.TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([
              { key: "servidores", name: "Servidores", description: "Servidores", type: 2 },
            ]),
            signal: AbortSignal.timeout(ROLE_CONNECTION_TIMEOUT_MS),
          }
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${body}`.trim());
        }
      }, log, "Actualización de role connections metadata");
    } catch (err) {
      log?.error("Error al actualizar role connections metadata", { err: err.message });
    }

    // ── Sync slash commands ───────────────────────────────────────────────
    try {
      await client.sync();
      log?.info("Comandos slash sincronizados");
    } catch (err) {
      log?.error("Error al sincronizar comandos slash", { err: err.message });
    }

    // ── Patch integration_types / contexts ────────────────────────────────
    try {
      const rest     = new REST().setToken(config.TOKEN);
      const commands = await rest.get(Routes.applicationCommands(config.CLIENT_ID));

      for (const cmd of commands) {
        setId(cmd.name, cmd.id);

        if (!COMMANDS_TO_UPDATE.includes(cmd.name)) continue;

        try {
          await runWithRetry(() => rest.patch(Routes.applicationCommand(config.CLIENT_ID, cmd.id), {
            body: {
              integration_types: [0, 1],
              contexts:          [0, 1, 2],
            },
          }), log, `Patch de contextos para ${cmd.name}`);
          log?.info(`Contextos actualizados: ${cmd.name}`);
        } catch (patchErr) {
          log?.error(`Error al actualizar contextos de ${cmd.name}`, { err: patchErr.message });
        }
      }

      log?.info("Todos los contextos actualizados");
    } catch (err) {
      log?.error("Error al actualizar contextos", { err: err.message });
    }
    },
  }, log);
}

module.exports = { registerReadyHandler };
