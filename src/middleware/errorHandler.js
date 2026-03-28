const mongoose = require("mongoose");
const { closeDatabase } = require("../core/database");

let shuttingDown = false;

/**
 * Perform an orderly shutdown: destroy the Discord bot, close the DB
 * connection, and exit the process.
 *
 * A hard-kill timer is set so the process never hangs more than 10 s.
 *
 * @param {string} signal            - Signal name ("SIGTERM" | "SIGINT").
 * @param {import("erine").Erine} bot - Bot instance to destroy.
 * @param {import("../core/logger")} [log]
 */
async function gracefulShutdown(signal, bot, log) {
  if (shuttingDown) return;
  shuttingDown = true;

  log?.info(`${signal} recibido, iniciando cierre ordenado…`);

  const forceExitTimer = setTimeout(() => {
    log?.error("Cierre forzado tras timeout");
    process.exit(1);
  }, 10_000);

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
 * @param {import("erine").Erine} bot
 * @param {import("../core/logger")} log
 */
function registerShutdownHandlers(bot, log) {
  ["SIGTERM", "SIGINT"].forEach((sig) => {
    process.on(sig, () => gracefulShutdown(sig, bot, log));
  });
}

module.exports = { gracefulShutdown, registerShutdownHandlers };
