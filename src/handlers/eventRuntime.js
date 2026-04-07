const Logger = require("../core/logger");

const botEventRegistry = new WeakMap();
const PROCESS_ERROR_GUARD = Symbol.for("redbot.processErrorHandlersRegistered");

function sanitizeError(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  return err.stack || err.message || String(err);
}

function extractEventContext(args) {
  const meta = {};
  for (const item of args) {
    if (!item || typeof item !== "object") continue;

    const guild = item.guild ?? item.ctx?.guild ?? null;
    const user  = item.user ?? item.author ?? item.member?.user ?? item.ctx?.user ?? item.ctx?.author ?? null;
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
      const ctx = extractEventContext(args);
      log.error(`Fallo en evento: ${eventName}`, {
        event: eventName,
        ...ctx,
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

  const safeHandler = buildSafeEventHandler(eventDef.name, (...args) => eventDef.code(bot, ...args), log);
  if (once) bot.once(eventDef.name, safeHandler);
  else bot.on(eventDef.name, safeHandler);

  registered.add(key);
  botEventRegistry.set(bot, registered);
  return true;
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

module.exports = { registerBotEvent, registerProcessErrorHandlers, sanitizeError };
