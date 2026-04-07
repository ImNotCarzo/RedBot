const { ActivityType } = require("discord.js");
const { scheduleTempUnban, listPendingTempBans } = require("../src/services/moderation.service");
const Logger = require("../src/core/logger");
const { sanitizeError } = require("../src/handlers/eventRuntime");

const log = new Logger("EVENT_READY", process.env.LOG_LEVEL);
const presenceIntervals = new WeakMap();

async function restoreTempBans(client) {
  try {
    if (!client?.guilds) return;
    const pending = await listPendingTempBans();
    if (!pending.length) return;

    log.info(`Restaurando ${pending.length} tempban(s)...`);
    for (const entry of pending) {
      try {
        if (!entry?.guildId || !entry?.userId || !entry?.unbanAt) continue;
        scheduleTempUnban(client, entry.guildId, entry.userId, entry.unbanAt);
      } catch (err) {
        log.warn("Tempban inválido omitido", {
          guildId: entry?.guildId,
          userId: entry?.userId,
          err: sanitizeError(err),
        });
      }
    }
    log.info("Tempbans restaurados.");
  } catch (err) {
    log.error("Error al restaurar tempbans", { err: sanitizeError(err) });
  }
}

const event = {
  name: "clientReady",
  once: true,
  async code(bot, readyBot) {
    const client = readyBot ?? bot;
    if (!client?.user) {
      log.warn("clientReady sin usuario inicializado");
      return;
    }

    log.info(`${client.user.username} ready`, {
      guilds: client.guilds?.cache?.size ?? 0,
    });

    await restoreTempBans(client);

    const getActivities = () => [
      `${client.guilds.cache.size} servidores`,
      `${client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0)} usuarios`,
      "/help",
    ];

    const existingInterval = presenceIntervals.get(client);
    if (existingInterval) clearInterval(existingInterval);

    let i = 0;
    const interval = setInterval(() => {
      try {
        const activities = getActivities();
        client.user.setPresence({
          activities: [{ name: activities[i], type: ActivityType.Watching }],
          status: "dnd",
        });
        i = (i + 1) % activities.length;
      } catch (err) {
        log.error("Error al actualizar presencia", { err: sanitizeError(err) });
        const current = presenceIntervals.get(client);
        if (current) clearInterval(current);
        presenceIntervals.delete(client);
      }
    }, 10000);
    presenceIntervals.set(client, interval);

    client.once("invalidated", () => {
      const current = presenceIntervals.get(client);
      if (!current) return;
      clearInterval(current);
      presenceIntervals.delete(client);
      log.warn("Presencia detenida por invalidación de sesión");
    });
  },
};

module.exports = { data: event };
