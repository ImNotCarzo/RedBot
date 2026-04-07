const { closeDatabase } = require("../core/database");
const { registerProcessErrorHandlers } = require("../handlers/eventRuntime");

let shuttingDown = false;
let shutdownHandlersRegistered = false;
const SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? "15000", 10);

/**
 * Perform an orderly shutdown: destroy the Discord bot, close the DB
 * connection, and exit the process.
 *
 * A hard-kill timer is set so the process never hangs more than 10 s.
 *
 * @param {string} signal            - Signal name ("SIGTERM" | "SIGINT").
 * @param {import("gralonium").Gralonium} bot - Bot instance to destroy.
 * @param {import("../core/logger")} [log]
 */
async function gracefulShutdown(signal, bot, log) {
  if (shuttingDown) return;
  shuttingDown = true;

  log?.info(`${signal} recibido, iniciando cierre ordenado…`);

  const forceExitTimer = setTimeout(() => {
    log?.error("Cierre forzado tras timeout");
    process.exit(1);
  }, Number.isFinite(SHUTDOWN_TIMEOUT_MS) ? SHUTDOWN_TIMEOUT_MS : 15000);
  forceExitTimer.unref?.();

  try {
    if (typeof bot?.destroy === "function") {
      await bot.destroy().catch((err) => log?.error("Error al cerrar bot", { err: err.message }));
    }

    await closeDatabase(log);

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExitTimer);
    log?.error("Error inesperado durante cierre", { err: err.message });
    process.exit(1);
  }
}

/**
 * Register SIGTERM/SIGINT handlers for graceful shutdown.
 *
 * @param {import("gralonium").Gralonium} bot
 * @param {import("../core/logger")} log
 */
function registerShutdownHandlers(bot, log) {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;

  ["SIGTERM", "SIGINT"].forEach((sig) => {
    process.once(sig, () => gracefulShutdown(sig, bot, log));
  });
}

module.exports = { gracefulShutdown, registerShutdownHandlers, registerProcessErrorHandlers };
