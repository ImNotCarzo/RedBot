require("dotenv").config();

const { validateEnv }            = require("./config/env");
const Logger                     = require("./core/logger");
const { connectDatabase }        = require("./core/database");
const { createBot, initializeBot } = require("./core/bot");
const { registerShutdownHandlers, registerProcessErrorHandlers } = require("./middleware/errorHandler");
const { sanitizeError } = require("./handlers/eventRuntime");

const log = new Logger("MAIN", process.env.LOG_LEVEL || "info");

(async () => {
  registerProcessErrorHandlers(log);

  try {
    const config = validateEnv();
    log.info("Variables de entorno validadas");

    await connectDatabase(config.MONGO, log);

    const bot = createBot();
    await initializeBot(bot, config, log);

    registerShutdownHandlers(bot, log);
    log.info("Bot iniciado");
  } catch (err) {
    log.error("Error fatal durante el arranque", { err: sanitizeError(err) });
    process.exit(1);
  }
})();
