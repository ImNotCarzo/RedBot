const { ActivityType } = require("discord.js");
const TempBan = require("../models/TempBan");
const { scheduleTempUnban } = require("../utils/helpers");
const Logger = require("../src/core/logger");

const log = new Logger("READY");

async function restoreTempBans(client) {
  try {
    const pending = await TempBan.find({});
    if (!pending.length) return;

    log.info(`Restaurando ${pending.length} tempban(s)...`);
    for (const entry of pending) {
      scheduleTempUnban(client, entry.guildId, entry.userId, entry.unbanAt);
    }
    log.info("Tempbans restaurados.");
  } catch (err) {
    log.error("Error al restaurar tempbans", { err: err.message });
  }
}

let presenceInterval = null;

const event = {
  name: "clientReady",
  async code(bot) {
    log.info(`${bot.user.username} ready`);

    await restoreTempBans(bot);

    const getActivities = () => [
      `${bot.guilds.cache.size} servidores`,
      `${bot.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)} usuarios`,
      "/help",
    ];

    if (presenceInterval) clearInterval(presenceInterval);

    let i = 0;
    presenceInterval = setInterval(() => {
      try {
        const activities = getActivities();
        bot.user.setPresence({
          activities: [{ name: activities[i], type: ActivityType.Watching }],
          status: "dnd",
        });
        i = (i + 1) % activities.length;
      } catch (err) {
        log.error("Error al actualizar presencia", { err: err.message });
        clearInterval(presenceInterval);
        presenceInterval = null;
      }
    }, 10000);
  },
};

module.exports = { data: event };