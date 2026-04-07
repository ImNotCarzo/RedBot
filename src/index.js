require("dotenv").config();

const { validateEnv }            = require("./config/env");
const Logger                     = require("./core/logger");
const { connectDatabase }        = require("./core/database");
const { createBot }              = require("./core/bot");
const { registerShutdownHandlers, registerProcessErrorHandlers } = require("./middleware/errorHandler");

const log = new Logger("MAIN", process.env.LOG_LEVEL || "info");

(async () => {
  try {
    const config = validateEnv();
    log.info("Variables de entorno validadas");

    await connectDatabase(config.MONGO, log);

    const bot = createBot(config, log);
    log.info("Bot iniciado");

    registerProcessErrorHandlers(log);
    registerShutdownHandlers(bot, log);
  } catch (err) {
    log.error("Error fatal durante el arranque", { err: err.message });
    process.exit(1);
  }
})();
