const path = require("path");
const fs = require("fs");
const Logger = require("./logger");
const { closeDatabase } = require("./database");

const botEventRegistry = new WeakMap();
const PROCESS_ERROR_GUARD = Symbol.for("redbot.processErrorHandlersRegistered");
const SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? "15000", 10);

let shuttingDown = false;
let shutdownHandlersRegistered = false;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeError(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  return err.stack || err.message || String(err);
}

async function withTimeout(promise, timeoutMs, taskName = "Operación") {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${taskName} excedió el tiempo límite (${timeoutMs}ms)`));
        }, timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runWithRetry(task, log, taskName, attempts, baseDelayMs, maxDelayMs) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      if (attempt >= attempts) break;
      const backoff = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
      log?.warn(`${taskName} falló (intento ${attempt}/${attempts}), reintentando`, {
        err: err?.message ?? String(err),
        backoff,
      });
      await wait(backoff);
    }
  }
  throw lastError;
}

function extractEventContext(args) {
  const meta = {};
  for (const item of args) {
    if (!item || typeof item !== "object") continue;

    const guild = item.guild ?? item.ctx?.guild ?? null;
    const user = item.user ?? item.author ?? item.member?.user ?? item.ctx?.user ?? item.ctx?.author ?? null;
    const channel = item.channel ?? item.ctx?.channel ?? null;

    if (!meta.guildId && guild?.id) meta.guildId = guild.id;
    if (!meta.userId && user?.id) meta.userId = user.id;
    if (!meta.channelId && channel?.id) meta.channelId = channel.id;
    if (!meta.commandName && item.ctx?.command?.data?.name) {
      meta.commandName = item.ctx.command.data.name;
    }
  }
  return meta;
}

function buildSafeEventHandler(eventName, handler, log) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      log.error(`Fallo en evento: ${eventName}`, {
        event: eventName,
        ...extractEventContext(args),
        err: sanitizeError(err),
      });
    }
  };
}

function registerBotEvent(bot, eventDef, log = new Logger("EVENT", process.env.LOG_LEVEL)) {
  if (!bot || !eventDef?.name || typeof eventDef?.code !== "function") return false;

  const once = Boolean(eventDef.once);
  const source = eventDef.source ?? "runtime";
  const key = `${source}:${eventDef.name}:${once ? "once" : "on"}`;

  const registered = botEventRegistry.get(bot) ?? new Set();
  if (registered.has(key)) {
    log.warn("Evento duplicado omitido", { event: eventDef.name, source, once });
    return false;
  }

  const safeHandler = buildSafeEventHandler(
    eventDef.name,
    (...args) => eventDef.code(bot, ...args),
    log
  );
  if (once) bot.once(eventDef.name, safeHandler);
  else bot.on(eventDef.name, safeHandler);

  registered.add(key);
  botEventRegistry.set(bot, registered);
  return true;
}

function loadAndRegisterEvents(bot, log) {
  const eventsPath = path.join(__dirname, "../events");
  const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
  let loaded = 0;

  for (const file of eventFiles) {
    try {
      const event = require(path.join(eventsPath, file));
      if (!event?.data?.name || typeof event?.data?.code !== "function") continue;
      const registered = registerBotEvent(
        bot,
        { ...event.data, source: `events/${file}` },
        log
      );
      if (registered) loaded += 1;
    } catch (err) {
      log?.error(`Error cargando evento: ${file}`, { err: err.message });
    }
  }

  log?.info(`Eventos cargados: ${loaded}/${eventFiles.length}`);
}

function registerProcessErrorHandlers(log = new Logger("PROCESS", process.env.LOG_LEVEL)) {
  if (globalThis[PROCESS_ERROR_GUARD]) return;
  globalThis[PROCESS_ERROR_GUARD] = true;

  process.on("unhandledRejection", (reason) => {
    log.error("UnhandledRejection", { err: sanitizeError(reason) });
  });

  process.on("uncaughtException", (err) => {
    log.error("UncaughtException", { err: sanitizeError(err) });
  });
}

async function gracefulShutdown(signal, bot, log) {
  if (shuttingDown) return;
  shuttingDown = true;

  log?.info(`${signal} recibido, iniciando cierre ordenado…`);

  const forceExitTimer = setTimeout(() => {
    log?.error("Cierre forzado tras timeout");
    process.exit(1);
  }, Number.isFinite(SHUTDOWN_TIMEOUT_MS) ? SHUTDOWN_TIMEOUT_MS : 15000);
  forceExitTimer.unref();

  try {
    if (typeof bot?.destroy === "function") {
      await bot.destroy().catch((err) => log?.error("Error al cerrar bot", { err: err.message }));
    }

    await closeDatabase(log);

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExitTimer);
    log?.error("Error inesperado durante cierre", { err: err.message });
    process.exit(1);
  }
}

function registerShutdownHandlers(bot, log) {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;

  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.once(sig, () => gracefulShutdown(sig, bot, log));
  }
}

module.exports = {
  parsePositiveInt,
  wait,
  sanitizeError,
  withTimeout,
  runWithRetry,
  registerBotEvent,
  loadAndRegisterEvents,
  registerProcessErrorHandlers,
  registerShutdownHandlers,
};
