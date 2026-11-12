const path = require("path");
const fs = require("fs");
const { EmbedBuilder } = require("discord.js");
const { Gralonium, ComponentsV2Builder, V2Text, V2Paginator } = require("gralonium");
const { botOptions, RED } = require("./config");
const { closeDatabase } = require("./database");

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

class Logger {
  constructor(label, level = process.env.LOG_LEVEL || "info") {
    this.label = label;
    this.level = LEVELS[String(level).toUpperCase()] ?? LEVELS.INFO;
  }

  log(severity, message, meta = {}) {
    const numLevel = LEVELS[severity.toUpperCase()];
    if (numLevel === undefined || numLevel > this.level) return;

    const base = `${new Date().toISOString()} [${this.label}] ${severity.toUpperCase()}: ${message}`;
    if (Object.keys(meta).length) {
      console.log(base, JSON.stringify(meta));
    } else {
      console.log(base);
    }
  }

  error(msg, meta) { this.log("ERROR", msg, meta); }
  warn(msg, meta) { this.log("WARN", msg, meta); }
  info(msg, meta) { this.log("INFO", msg, meta); }
  debug(msg, meta) { this.log("DEBUG", msg, meta); }
}

const INVITE_URL = `https://redbot.me/invite`;
const SUPPORT_URL = "https://discord.gg/b8AKKaNWU6";
const THINKING_TEXT = "<a:typing:1484407380291616778>  RedBot está pensando...";

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
  for (let attempt = 1; attempt <= attempts; attempt++) {
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
    const user = item.user ?? item.author ?? item.member?.user ?? item.ctx?.user ?? null;
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

function loadAndRegisterEvents(bot, log = new Logger("EVENT")) {
  const eventsPath = path.join(__dirname, "../events");
  const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
  let loaded = 0;

  for (const file of eventFiles) {
    try {
      const eventDef = require(path.join(eventsPath, file))?.data;
      if (!eventDef?.name || typeof eventDef?.code !== "function") continue;

      const safeHandler = async (...args) => {
        try {
          await eventDef.code(bot, ...args);
        } catch (err) {
          log.error(`Fallo en evento: ${eventDef.name}`, {
            event: eventDef.name,
            ...extractEventContext(args),
            err: sanitizeError(err),
          });
        }
      };

      if (eventDef.once) bot.once(eventDef.name, safeHandler);
      else bot.on(eventDef.name, safeHandler);
      loaded++;
    } catch (err) {
      log?.error(`Error cargando evento: ${file}`, { err: err.message });
    }
  }

  log?.info(`Eventos cargados: ${loaded}/${eventFiles.length}`);
}

function createBot() {
  const { getPrefix, DEFAULT_PREFIX } = require("./guild");

  const bot = new Gralonium({
    ...botOptions,
    prefix: async (ctx) => {
      const message = ctx.data;
      if (!message?.content || message?.author?.bot) return null;

      const content = message.content;
      const guildId = message.guildId;
      const botId = message.client?.user?.id;

      if (botId) {
        const mentionA = `<@${botId}>`;
        const mentionB = `<@!${botId}>`;
        const trimmed = content.trim();
        if (trimmed === mentionA || trimmed === mentionB) {
          const guildPrefix = guildId ? await getPrefix(guildId) : DEFAULT_PREFIX;
          await message.reply({
            content: `Mi prefijo en este servidor es \`${guildPrefix}\``,
            allowedMentions: { repliedUser: false },
          }).catch(() => {});
          return null;
        }
        if (content.startsWith(mentionA)) return mentionA;
        if (content.startsWith(mentionB)) return mentionB;
      }

      if (!guildId) return content.startsWith(DEFAULT_PREFIX) ? DEFAULT_PREFIX : null;

      const prefix = await getPrefix(guildId);
      return content.startsWith(prefix) ? prefix : null;
    },
  });

  bot.setMaxListeners(20);
  return bot;
}

async function initializeBot(bot, config, log) {
  const { wrapPrefixedCommands } = require("./adapter");
  await bot.load("commands");
  wrapPrefixedCommands(log);
  loadAndRegisterEvents(bot, log);
  await bot.login(config.TOKEN);
}

function registerProcessErrorHandlers(log = new Logger("PROCESS")) {
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
    try {
      const { stopApi } = require("./api");
      await stopApi();
    } catch {}

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

// ─── Shared Command Helpers ───────────────────────────────────────────────────

function formatPermissionName(p) {
  if (!p) return "";
  return `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}\``;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...options, signal });
}

function noGuildReply(ctx, message = "Este comando solo funciona en servidores") {
  const card = ComponentsV2Builder.card({
    description: message,
    color: RED,
    links: [{ label: "Invítame", url: INVITE_URL }],
  });
  return ctx.ephemeral(card);
}

function handleCommandError(ctx, err) {
  if (err && typeof err === "object" && !err.ctx && ctx) {
    err.ctx = ctx;
  }
  const bot = ctx?.bot ?? ctx?.client;
  if (typeof bot?.handleFrameworkError === "function") {
    bot.handleFrameworkError(err, ctx);
  } else if (typeof bot?.emit === "function") {
    bot.emit("frameworkError", err, ctx);
  }
}

const commandErrorLog = new Logger("CMD_ERROR");

const avatarUrl = (user, size = 256) => user?.displayAvatarURL?.({ size }) ?? null;
const roleIconUrl = (role, size = 256) => (role.icon ? role.iconURL({ size }) : null);

function buildActionCard({
  title,
  subtitle = null,
  description = null,
  fields = null,
  sections = null,
  moderator = null,
  color = RED,
  thumbnail = null,
}) {
  return ComponentsV2Builder.card({
    title: title ? V2Text.heading(title, 3, 200) : null,
    subtitle: subtitle ? V2Text.subtext(subtitle, 120) : null,
    description,
    fields: Array.isArray(fields) && fields.length ? fields : undefined,
    sections: Array.isArray(sections) && sections.length ? sections : undefined,
    footer: moderator ? V2Text.subtext(`Moderador: ${moderator}`, 200) : null,
    color,
    thumbnail,
  });
}

function failWith(ctx, err, message) {
  if (err?.code === 50013 || err?.code === 50006) return handleCommandError(ctx, err);
  commandErrorLog.error(message, {
    command: ctx?.command?.data?.name,
    err: err?.stack || err?.message || String(err),
  });
  return ctx.ephemeral(ComponentsV2Builder.card({ description: message, color: RED }));
}

function createListPaginator({ items, ownerId, perPage = 15, timeout = 2 * 60 * 1000, render }) {
  return new V2Paginator({
    items,
    perPage,
    ownerId,
    thirdPartyMode: "reject",
    thirdPartyMessage: "No es tu comando",
    wrap: false,
    prevButton: { label: "◀" },
    nextButton: { label: "▶" },
    showPageIndicator: false,
    timeout,
    renderPage: ({ items: pageItems, pageIndex, totalPages, isEnded, controls }) =>
      render({
        items: pageItems,
        pageIndex,
        totalPages,
        controls: !isEnded && totalPages > 1 ? controls : null,
      }),
  });
}

function formatSortedRoles(roleCache, excludeRoleId) {
  return roleCache
    .filter((r) => r.id !== excludeRoleId)
    .sort((a, b) => b.position - a.position)
    .map((r) => `<@&${r.id}>`);
}

const activeBroadcasts = new Set();
const clip = (s, max = 1024) => {
  const str = String(s ?? "");
  return str.length > max ? `${str.slice(0, max - 1)}…` : str || "-";
};

async function sendDmWithRetry(member, payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await member.send(payload);
      return true;
    } catch (err) {
      if (err?.status === 429) {
        await wait((err?.rawError?.retry_after ?? 2) * 1000);
        continue;
      }
      return false;
    }
  }
  return false;
}

async function broadcastDm({ guild, embed, soloRolId, excluirRolId, excluirUserId, onProgress }) {
  if (activeBroadcasts.has(guild.id)) return null;
  activeBroadcasts.add(guild.id);

  try {
    await guild.members.fetch();

    const members = [...guild.members.cache.values()].filter((m) => {
      if (m.user.bot) return false;
      if (soloRolId && !m.roles.cache.has(soloRolId)) return false;
      if (excluirRolId && m.roles.cache.has(excluirRolId)) return false;
      if (excluirUserId && m.id === excluirUserId) return false;
      return true;
    });

    const total = members.length;
    await onProgress?.(0, total);

    let enviados = 0;
    let fallidos = 0;

    for (let i = 0; i < total; i++) {
      if (await sendDmWithRetry(members[i], { embeds: [embed] })) enviados++;
      else fallidos++;

      await wait(500);
      if ((i + 1) % 10 === 0 || i + 1 === total) await onProgress?.(i + 1, total);
    }

    return { enviados, fallidos, total };
  } finally {
    activeBroadcasts.delete(guild.id);
  }
}

function buildDmAllLogEmbed({ author, enviados, fallidos, titulo, texto, filtros }) {
  return new EmbedBuilder()
    .setTitle("DM masivo enviado")
    .setColor(RED)
    .addFields(
      { name: "Moderador", value: author.tag ?? author.username, inline: true },
      { name: "Enviados", value: `\`${enviados}\``, inline: true },
      { name: "Fallidos", value: `\`${fallidos}\``, inline: true },
      { name: "Título", value: clip(titulo), inline: false },
      { name: "Texto", value: clip(texto), inline: false },
      ...(filtros.length ? [{ name: "Filtros", value: clip(filtros.join("\n")), inline: false }] : []),
    )
    .setTimestamp();
}

function buildDmAllEmbed({ titulo, texto, author, guild, imagenUrl }) {
  const avatarUrl = author.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
  const embed = new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(texto)
    .setColor(RED)
    .setFooter({ text: `att: ${author.globalName ?? author.username}`, iconURL: avatarUrl })
    .setThumbnail(guild.iconURL({ size: 512 }));
  if (imagenUrl) embed.setImage(imagenUrl);
  return embed;
}

module.exports = {
  Logger,
  INVITE_URL,
  SUPPORT_URL,
  THINKING_TEXT,
  parsePositiveInt,
  wait,
  sanitizeError,
  withTimeout,
  runWithRetry,
  createBot,
  initializeBot,
  registerProcessErrorHandlers,
  registerShutdownHandlers,
  formatPermissionName,
  fetchWithTimeout,
  noGuildReply,
  handleCommandError,
  buildActionCard,
  createListPaginator,
  formatSortedRoles,
  avatarUrl,
  roleIconUrl,
  failWith,
  broadcastDm,
  buildDmAllEmbed,
  buildDmAllLogEmbed,
};
