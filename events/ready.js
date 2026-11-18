const { ActivityType, Routes } = require("discord.js");
const { hydrateAiSessions } = require("../src/ai");
const { startAutomationWorkers } = require("../src/automation");
const { restoreTempChannels, startChannelsWorkers } = require("../src/channelsExtra");
const { snapshotAllInvites, startCommunityWorkers } = require("../src/community");
const { startSocialFeedWorker } = require("../src/feeds");
const { scheduleTempUnban, listPendingTempBans } = require("../src/moderation");
const { restoreTempRoles } = require("../src/reactionRoles");
const { restoreReminders } = require("../src/reminders");
const { Logger, sanitizeError, parsePositiveInt, withTimeout, runWithRetry } = require("../src/runtime");
const { setId } = require("../src/config");

const log = new Logger("EVENT_READY", process.env.LOG_LEVEL);

const READY_RETRY_ATTEMPTS = parsePositiveInt(process.env.READY_RETRY_ATTEMPTS, 5);
const READY_RETRY_BASE_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_BASE_DELAY_MS, 1500);
const READY_RETRY_MAX_DELAY_MS = parsePositiveInt(process.env.READY_RETRY_MAX_DELAY_MS, 30000);
const READY_API_TIMEOUT_MS = parsePositiveInt(process.env.READY_API_TIMEOUT_MS, 45000);

let presenceInterval = null;
let didRunReady = false;

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
  const clientId = client?.user?.id ?? process.env.CLIENT_ID;

  await runReadyStep("Sincronización de comandos (slash y menús contextuales)", () => client.sync());
  log.info("Comandos slash y menús contextuales sincronizados");

  const commands = await runReadyStep("Lectura de comandos de aplicación", () =>
    client.rest.get(Routes.applicationCommands(clientId))
  );

  for (const cmd of commands) {
    setId(cmd.name, cmd.id);
  }

  log.info("IDs de comandos actualizados");
}

function stopPresenceRotation() {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
}

function startPresenceRotation(client) {
  stopPresenceRotation();

  const getActivities = () => [
    `${client.guilds.cache.size} servidores`,
    `${client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0)} usuarios`,
    "/help",
  ];

  let i = 0;
  const applyPresence = () => {
    try {
      if (!client?.user) return;
      const activities = getActivities();
      client.user.setPresence({
        activities: [{ name: activities[i], type: ActivityType.Watching }],
        status: "dnd",
      });
      i = (i + 1) % activities.length;
    } catch (err) {
      log.error("Error al actualizar presencia", { err: sanitizeError(err) });
      stopPresenceRotation();
    }
  };

  applyPresence();
  presenceInterval = setInterval(applyPresence, 30000);
  presenceInterval.unref?.();
}

const READY_RESTORE_TIMEOUT_MS = parsePositiveInt(process.env.READY_RESTORE_TIMEOUT_MS, 15000);

const runRestoreStep = (label, fn) =>
  withTimeout(Promise.resolve().then(fn), READY_RESTORE_TIMEOUT_MS, label).catch((err) => {
    log.warn(`Paso de arranque omitido (${label})`, { err: err?.message ?? String(err) });
  });

const readyEvent = {
  name: "clientReady",
  once: true,
  async code(bot, readyBot) {
    if (didRunReady) return;
    didRunReady = true;
    const client = readyBot ?? bot;
    if (!client?.user) {
      didRunReady = false;
      log.warn("clientReady sin usuario inicializado");
      return;
    }

    log.info(`${client.user.username} ready`, {
      guilds: client.guilds?.cache?.size ?? 0,
    });

    startPresenceRotation(client);
    startChannelsWorkers(client);
    startAutomationWorkers(client);
    startSocialFeedWorker(client);
    startCommunityWorkers(client);

    await Promise.allSettled([
      runRestoreStep("tempbans", () => restoreTempBans(client)),
      runRestoreStep("reminders", () => restoreReminders(client)),
      runRestoreStep("temproles", () => restoreTempRoles(client)),
      runRestoreStep("tempchannels", () => restoreTempChannels(client)),
      runRestoreStep("aisessions", () => hydrateAiSessions()),
    ]);

    snapshotAllInvites(client).catch((err) => {
      log.warn("Error al indexar invitaciones en segundo plano", { err: err?.message ?? String(err) });
    });

    try {
      await syncSlashAndContexts(client);
    } catch (err) {
      log.error("Fallo al sincronizar comandos slash en arranque", { err: err?.message ?? String(err) });
    }
  },
};

const shardResumeEvent = {
  name: "shardResume",
  once: false,
  async code(bot) {
    if (bot?.user) startPresenceRotation(bot);
  },
};

module.exports = {
  data: [readyEvent, shardResumeEvent],
  stopPresenceRotation,
  ensureReadyRan: (bot) => (!didRunReady && bot?.isReady?.() ? readyEvent.code(bot, bot) : null),
};
