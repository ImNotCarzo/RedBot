const path = require("path");
const fs = require("fs");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { Gralonium } = require("gralonium");
const { botOptions, RED } = require("./config");
const { closeDatabase } = require("./database");

// Tras deferReply() público, Discord ignora el flag Ephemeral en editReply.
// Para respetarlo en errores, se borra el "pensando..." y se envía un followUp efímero.
const { Context: GraloniumContext } = require("gralonium");
const baseContextSend = GraloniumContext.prototype.send;
GraloniumContext.prototype.send = async function send(payload) {
  const interaction = this.data;
  const flags = payload && typeof payload === "object" ? payload.flags : null;
  const wantsEphemeral = flags != null && (Number(flags) & MessageFlags.Ephemeral) === MessageFlags.Ephemeral;
  if (wantsEphemeral && interaction?.deferred && !interaction.ephemeral && typeof interaction.followUp === "function") {
    if (!interaction.replied) await interaction.deleteReply().catch(() => {});
    return interaction.followUp(payload);
  }
  return baseContextSend.call(this, payload);
};
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

const CLIENT_ID = process.env.CLIENT_ID || "1020772849906098186";
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

function clampPage(page, totalPages) {
  if (!Number.isFinite(page) || !Number.isFinite(totalPages) || totalPages <= 0) return 0;
  return Math.max(0, Math.min(totalPages - 1, page));
}

function paginateArray(arr, size = 15) {
  if (!Array.isArray(arr) || size <= 0) return [];
  const pages = [];
  for (let i = 0; i < arr.length; i += size) {
    pages.push(arr.slice(i, i + size));
  }
  return pages;
}

function buildPaginationRow(prevId, nextId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

function uniqueId(prefix = "collector") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function sendThinkingReply(ctx) {
  const msg = await ctx.send({
    content: THINKING_TEXT,
    allowedMentions: { repliedUser: false },
  });
  if (ctx && msg) ctx._thinkingMessage = msg;
  return msg;
}

function formatPermissionName(p) {
  if (!p) return "";
  return `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}\``;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...options, signal });
}

async function prepareReply(ctx, { thinking = false } = {}) {
  if (ctx.interaction) {
    await ctx.interaction.deferReply();
    return (payload) => ctx.interaction.editReply(payload);
  }
  if (!thinking) return (payload) => ctx.send(payload);

  let pending = await sendThinkingReply(ctx).catch(() => null);
  return async (payload) => {
    const current = pending;
    pending = null;
    ctx._thinkingMessage = null;
    if (!current?.edit) return ctx.send(payload);
    const body = typeof payload === "string" ? { content: payload } : payload;
    if (body.flags != null && (Number(body.flags) & MessageFlags.Ephemeral) === MessageFlags.Ephemeral) {
      await current.delete().catch(() => {});
      return ctx.send(body);
    }
    return current.edit({ content: "", embeds: [], components: [], ...body }).catch(() => ctx.send(body));
  };
}

function noGuildReply(ctx, message = "Este comando solo funciona en servidores") {
  return ctx.send({
    embeds: [new EmbedBuilder().setDescription(message).setColor(RED)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Invítame").setStyle(ButtonStyle.Link).setURL(INVITE_URL)
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
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

function failWith(ctx, err, message, send = (payload) => ctx.send(payload)) {
  if (err?.code === 50013 || err?.code === 50006) return handleCommandError(ctx, err);
  commandErrorLog.error(message, {
    command: ctx?.command?.data?.name,
    err: err?.stack || err?.message || String(err),
  });
  return send({ content: message, flags: MessageFlags.Ephemeral });
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
  loadAndRegisterEvents,
  createBot,
  initializeBot,
  registerProcessErrorHandlers,
  registerShutdownHandlers,
  clampPage,
  paginateArray,
  buildPaginationRow,  buildPagRow: buildPaginationRow,
  uniqueId,
  sendThinkingReply,
  formatPermissionName,
  fetchWithTimeout,
  prepareReply,
  noGuildReply,
  handleCommandError,
  failWith,
  broadcastDm,
  buildDmAllEmbed,
  buildDmAllLogEmbed,
};
