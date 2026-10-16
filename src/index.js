require("dotenv").config();

const { validateEnv } = require("./config");
const { connectDatabase } = require("./database");
const {
  Logger,
  createBot,
  initializeBot,
  registerShutdownHandlers,
  registerProcessErrorHandlers,
  sanitizeError,
} = require("./runtime");
const { startApi } = require("./api");

const log = new Logger("MAIN");

(async () => {
  registerProcessErrorHandlers(log);

  try {
    const config = validateEnv();
    log.info("Variables de entorno validadas");

    await connectDatabase(config.MONGO, log);

    const bot = createBot();
    await initializeBot(bot, config, log);

    await startApi(bot, config, log);

    registerShutdownHandlers(bot, log);
    log.info("Bot iniciado");
  } catch (err) {
    log.error("Error fatal durante el arranque", { err: sanitizeError(err) });
    process.exit(1);
  }
})();
