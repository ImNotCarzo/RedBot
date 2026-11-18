require("dotenv").config();

const { validateEnv } = require("./config");
const { connectDatabase, closeDatabase } = require("./database");
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

  let bot = null;
  registerShutdownHandlers(() => bot, log);

  try {
    const config = validateEnv();
    log.info("Variables de entorno validadas");

    await connectDatabase(config.MONGO, log);

    bot = createBot();
    await initializeBot(bot, config, log);

    await startApi(bot, config, log);

    log.info("Bot iniciado");
  } catch (err) {
    log.error("Error fatal durante el arranque", { err: sanitizeError(err) });
    if (bot) {
      await Promise.resolve(bot.destroy?.()).catch(() => {});
    }
    await closeDatabase(log).catch(() => {});
    process.exit(1);
  }
})();
