const { ActivityType, REST, Routes } = require("discord.js");
const { hydrateAiSessions } = require("../src/ai");
const { scheduleTempUnban, listPendingTempBans } = require("../src/moderation");
const { restoreReminders } = require("../src/reminders");
const { Logger, sanitizeError, parsePositiveInt, withTimeout, runWithRetry } = require("../src/runtime");
const { setId } = require("../src/config");

const log = new Logger("EVENT_READY", process.env.LOG_LEVEL);

const READY_RETRY_ATTEMPTS = parsePositiveInt(process.env.READY_RETRY_ATTEMPTS, 5);
const READY_RETRY_BASE_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_BASE_DELAY_MS, 1500);
const READY_RETRY_MAX_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_MAX_DELAY_MS, 30000);
const READY_API_TIMEOUT_MS = parsePositiveInt(process.env.READY_API_TIMEOUT_MS, 45000);

let presenceInterval = null;

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

const runReadyStep = (label, fn) =>
  runWithRetry(
    () => withTimeout(fn(), READY_API_TIMEOUT_MS, label),
    log,
    label,
    READY_RETRY_ATTEMPTS,
    READY_RETRY_BASE_DELAY_MS,
    READY_RETRY_MAX_DELAY_MS
  );

async function syncSlashAndContexts(client) {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;

  await runReadyStep("Sincronización de comandos (slash y menús contextuales)", () => client.sync());
  log.info("Comandos slash y menús contextuales sincronizados");

  const rest = new REST().setToken(token);
  const commands = await runReadyStep("Lectura de comandos de aplicación", () =>
    rest.get(Routes.applicationCommands(clientId))
  );

  for (const cmd of commands) {
    setId(cmd.name, cmd.id);
  }

  log.info("IDs de comandos actualizados");
}

function startPresenceRotation(client) {
  if (presenceInterval) clearInterval(presenceInterval);

  const getActivities = () => [
    `${client.guilds.cache.size} servidores`,
    `${client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0)} usuarios`,
    "/help",
  ];

  let i = 0;
  presenceInterval = setInterval(() => {
    try {
      const activities = getActivities();
      client.user.setPresence({
        activities: [{ name: activities[i], type: ActivityType.Watching }],
        status: "dnd",
      });
      i = (i + 1) % activities.length;
    } catch (err) {
      log.error("Error al actualizar presencia", { err: sanitizeError(err) });
      if (presenceInterval) clearInterval(presenceInterval);
      presenceInterval = null;
    }
  }, 10000);
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
    await restoreReminders(client);
    await hydrateAiSessions();
    startPresenceRotation(client);

    try {
      await syncSlashAndContexts(client);
    } catch (err) {
      log.error("Fallo al sincronizar comandos slash en arranque", { err: err?.message ?? String(err) });
    }
  },
};

module.exports = { data: event };
