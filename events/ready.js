const { ActivityType, REST, Routes } = require("discord.js");
const { scheduleTempUnban, listPendingTempBans } = require("../src/moderation");
const Logger = require("../src/logger");
const { sanitizeError, parsePositiveInt, withTimeout, runWithRetry } = require("../src/runtime");
const { setId } = require("../src/commandIds");
const { COMMANDS_TO_UPDATE } = require("../src/config");

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

async function syncSlashAndContexts(client) {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;

  await runWithRetry(
    () => withTimeout(client.sync(), READY_API_TIMEOUT_MS, "Sincronización de comandos slash"),
    log,
    "Sincronización de comandos slash",
    READY_RETRY_ATTEMPTS,
    READY_RETRY_BASE_DELAY_MS,
    READY_RETRY_MAX_DELAY_MS
  );
  log.info("Comandos slash sincronizados");

  const rest = new REST().setToken(token);
  const commands = await runWithRetry(
    () => withTimeout(
      rest.get(Routes.applicationCommands(clientId)),
      READY_API_TIMEOUT_MS,
      "Lectura de comandos de aplicación"
    ),
    log,
    "Lectura de comandos de aplicación",
    READY_RETRY_ATTEMPTS,
    READY_RETRY_BASE_DELAY_MS,
    READY_RETRY_MAX_DELAY_MS
  );

  for (const cmd of commands) {
    setId(cmd.name, cmd.id);
  }

  for (const cmd of commands) {
    if (!COMMANDS_TO_UPDATE.includes(cmd.name)) continue;

    try {
      await runWithRetry(
        () => withTimeout(
          rest.patch(Routes.applicationCommand(clientId, cmd.id), {
            body: {
              integration_types: [0, 1],
              contexts: [0, 1, 2],
            },
          }),
          READY_API_TIMEOUT_MS,
          `Patch de contextos para ${cmd.name}`
        ),
        log,
        `Patch de contextos para ${cmd.name}`,
        READY_RETRY_ATTEMPTS,
        READY_RETRY_BASE_DELAY_MS,
        READY_RETRY_MAX_DELAY_MS
      );
      log.info(`Contextos actualizados: ${cmd.name}`);
    } catch (patchErr) {
      log.error(`Error al actualizar contextos de ${cmd.name}`, { err: patchErr.message });
    }
  }

  log.info("Todos los contextos actualizados");
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
    startPresenceRotation(client);

    try {
      await syncSlashAndContexts(client);
    } catch (err) {
      log.error("Fallo al sincronizar comandos slash en arranque", { err: err?.message ?? String(err) });
    }
  },
};

module.exports = { data: event };
