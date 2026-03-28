const path = require("path");
const fs   = require("fs");

/**
 * Load all event modules from the `events/` directory and register them on
 * the bot instance.
 *
 * @param {import("erine").Erine} bot
 * @param {import("../core/logger")} [log]
 */
function loadAndRegisterEvents(bot, log) {
  const eventsPath = path.join(__dirname, "../../events");
  const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
  let loaded = 0;

  for (const file of eventFiles) {
    try {
      const event = require(path.join(eventsPath, file));
      if (!event?.data?.name || typeof event?.data?.code !== "function") continue;
      bot.on(event.data.name, (...args) => event.data.code(bot, ...args));
      loaded += 1;
    } catch (err) {
      log?.error(`Error cargando evento: ${file}`, { err: err.message });
    }
  }

  log?.info(`Eventos cargados: ${loaded}/${eventFiles.length}`);
}

module.exports = { loadAndRegisterEvents };
