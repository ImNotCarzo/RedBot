const mongoose = require("mongoose");
const dbConfig = require("../config/db.config");

/**
 * Connect to MongoDB with exponential-backoff retry logic.
 *
 * @param {string} uri      - MongoDB connection URI.
 * @param {import("../core/logger")} [log] - Optional logger instance.
 * @returns {Promise<void>}
 */
async function connectDatabase(uri, log) {
  const { retryAttempts, retryDelay, options } = dbConfig;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      await mongoose.connect(uri, options);
      log?.info("Base de datos conectada", { attempt });
      return;
    } catch (err) {
      const isLast = attempt === retryAttempts;
      if (isLast) {
        log?.error("No se pudo conectar a la base de datos tras varios intentos", { err: err.message });
        throw err;
      }
      const wait = retryDelay * Math.pow(2, attempt - 1);
      log?.warn(`Error conectando a DB (intento ${attempt}/${retryAttempts}), reintentando en ${wait}ms`, { err: err.message });
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

/**
 * Gracefully close the MongoDB connection.
 *
 * @param {import("../core/logger")} [log]
 * @returns {Promise<void>}
 */
async function closeDatabase(log) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close().catch((err) => {
      log?.error("Error al cerrar la conexión de base de datos", { err: err.message });
    });
    log?.info("Conexión de base de datos cerrada");
  }
}

module.exports = { connectDatabase, closeDatabase };
