require("dotenv").config();

const { validateEnv } = require("./config");
const Logger = require("./logger");
const { connectDatabase } = require("./database");
const { createBot, initializeBot } = require("./bot");
const { registerShutdownHandlers, registerProcessErrorHandlers, sanitizeError } = require("./runtime");

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
