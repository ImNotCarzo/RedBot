const mongoose = require("mongoose");
const { dbOptions } = require("./config");

async function connectDatabase(uri, log) {
  const { retryAttempts, retryDelay, options } = dbOptions;

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
      const waitMs = retryDelay * Math.pow(2, attempt - 1);
      log?.warn(`Error conectando a DB (intento ${attempt}/${retryAttempts}), reintentando en ${waitMs}ms`, {
        err: err.message,
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function closeDatabase(log) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close().catch((err) => {
      log?.error("Error al cerrar la conexión de base de datos", { err: err.message });
    });
    log?.info("Conexión de base de datos cerrada");
  }
}

module.exports = { connectDatabase, closeDatabase };
