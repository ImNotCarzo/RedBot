const path = require("path");
const fs = require("fs");
const { ChannelFlags, EmbedBuilder, PermissionsBitField, Routes } = require("discord.js");
const { Gralonium, ComponentsV2Builder, V2Text, V2Paginator } = require("gralonium");
const { botOptions, RED } = require("./config");
const { closeDatabase } = require("./database");
const { getCurrentLang, localizeCommand } = require("./i18n");

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

function safeStringify(meta) {
  try {
    return JSON.stringify(meta, (_key, val) => (typeof val === "bigint" ? val.toString() : val));
  } catch {
    return "[unserializable_meta]";
  }
}

class Logger {
  constructor(label, level = process.env.LOG_LEVEL || "info") {
    this.label = label;
    this.level = LEVELS[String(level).toUpperCase()] ?? LEVELS.INFO;
  }

  log(severity, message, meta = {}) {
    const numLevel = LEVELS[severity.toUpperCase()];
    if (numLevel === undefined || numLevel > this.level) return;

    const base = `${new Date().toISOString()} [${this.label}] ${severity.toUpperCase()}: ${message}`;
    if (meta && Object.keys(meta).length) {
      console.log(base, safeStringify(meta));
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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SHUTDOWN_TIMEOUT_MS = parsePositiveInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS, 15000);

let shuttingDown = false;
let shutdownHandlersRegistered = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactSecrets(text) {
  let out = String(text ?? "");
  for (const envKey of ["TOKEN", "MONGO", "GEMINI", "GEMINI2", "GEMINI3", "GROQ", "CLIENT_SECRET", "API_KEY", "SESSION_SECRET"]) {
    const val = process.env[envKey];
    if (val && val.length >= 6) {
      out = out.split(val).join(`[REDACTED_${envKey}]`);
    }
  }
  return out
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/(mongodb(?:\+srv)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[REDACTED]@");
}

function sanitizeError(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return redactSecrets(err);
  return redactSecrets(err.stack || err.message || String(err));
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
        err: sanitizeError(err),
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
      const exported = require(path.join(eventsPath, file))?.data;
      const eventDefs = Array.isArray(exported) ? exported : exported ? [exported] : [];

      for (const rawDef of eventDefs) {
        const eventName = rawDef?.name ?? rawDef?.data?.name;
        const once = Boolean(rawDef?.once ?? rawDef?.data?.once);
        const code = rawDef?.code;
        if (!eventName || typeof code !== "function") continue;

        const safeHandler = async (...args) => {
          try {
            await code(bot, ...args);
          } catch (err) {
            log.error(`Fallo en evento: ${eventName}`, {
              event: eventName,
              ...extractEventContext(args),
              err: sanitizeError(err),
            });
          }
        };

        if (once) bot.once(eventName, safeHandler);
        else bot.on(eventName, safeHandler);
        loaded++;
      }
    } catch (err) {
      log?.error(`Error cargando evento: ${file}`, { err: sanitizeError(err) });
    }
  }

  log?.info(`Eventos cargados: ${loaded}/${eventFiles.length}`);
}

function createBot() {
  const { getPrefix, getLang, DEFAULT_PREFIX } = require("./guild");

  const bot = new Gralonium({
    ...botOptions,
    localizeCommand,
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
          const lang = guildId ? await getLang(guildId) : "es";
          await message.reply({
            content: lang === "en"
              ? `My prefix in this server is \`${guildPrefix}\``
              : `Mi prefijo en este servidor es \`${guildPrefix}\``,
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
  await bot.load(path.join(__dirname, "../commands"));
  wrapPrefixedCommands(log);
  loadAndRegisterEvents(bot, log);
  await bot.login(config.TOKEN);
  await require("../events/ready").ensureReadyRan?.(bot);
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

async function gracefulShutdown(signal, botOrGetter, log) {
  if (shuttingDown) return;
  shuttingDown = true;

  log?.info(`${signal} recibido, iniciando cierre ordenado…`);

  const forceExitTimer = setTimeout(() => {
    log?.error("Cierre forzado tras timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    try {
      const { stopApi } = require("./api");
      await stopApi();
    } catch {}
    try { require("./channelsExtra").stopChannelsWorkers(); } catch {}
    try { require("./reactionRoles").stopTempRoleTimers(); } catch {}
    try { require("./automation").stopAutomationWorkers(); } catch {}
    try { require("./feeds").stopSocialFeedWorker(); } catch {}
    try { require("./community").stopCommunityWorkers(); } catch {}
    try { require("./reminders").stopReminderTimers?.(); } catch {}
    try { require("./moderation").stopTempBanTimers?.(); } catch {}
    try { require("../events/ready").stopPresenceRotation?.(); } catch {}
    try { await require("./security").closePublicAgent?.(); } catch {}

    const bot = typeof botOrGetter === "function" ? botOrGetter() : botOrGetter;
    if (typeof bot?.destroy === "function") {
      await Promise.resolve(bot.destroy()).catch((err) => log?.error("Error al cerrar bot", { err: sanitizeError(err) }));
    }

    await closeDatabase(log);

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExitTimer);
    log?.error("Error inesperado durante cierre", { err: sanitizeError(err) });
    process.exit(1);
  }
}

function registerShutdownHandlers(botOrGetter, log) {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;

  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.once(sig, () => gracefulShutdown(sig, botOrGetter, log));
  }
}

// ─── Shared Command Helpers ───────────────────────────────────────────────────

function formatPermissionName(p) {
  if (!p) return "";
  return `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}\``;
}

function isObfuscatedChannel(channel) {
  return Boolean(channel?.flags?.has?.(ChannelFlags.ChannelObfuscated)) || channel?.name === "___hidden___";
}

function formatRoleColorInfo(role) {
  const colors = role?.colors;
  const toHex = (n) => (Number.isFinite(n) && n > 0 ? `#${n.toString(16).padStart(6, "0")}` : null);
  const primary = colors?.primaryColor ?? role?.color ?? 0;
  const secondary = colors?.secondaryColor ?? null;
  const tertiary = colors?.tertiaryColor ?? null;

  let style = "none";
  let styleLabel = "Sin color";
  let display = "Sin color";

  if (tertiary != null) {
    style = "holographic";
    styleLabel = "Holográfico";
    display = `${toHex(primary) ?? "#000000"} → ${toHex(secondary) ?? "#000000"} → ${toHex(tertiary) ?? "#000000"} (Holográfico)`;
  } else if (secondary != null) {
    style = "gradient";
    styleLabel = "Degradado";
    display = `${toHex(primary) ?? "#000000"} → ${toHex(secondary) ?? "#000000"}`;
  } else if (primary) {
    style = "solid";
    styleLabel = "Sólido";
    display = toHex(primary);
  }

  return {
    style,
    styleLabel,
    primary,
    secondary,
    tertiary,
    primaryHex: toHex(primary),
    secondaryHex: toHex(secondary),
    tertiaryHex: toHex(tertiary),
    display,
    hasColor: style !== "none",
  };
}

async function fetchComputedChannelPermissions({ client, channel, targetType = "member", targetId, fallbackPerms = null }) {
  const rest = client?.rest;
  if (rest?.get && channel?.id && targetId) {
    const route = targetType === "role"
      ? Routes.channelPermissionsRole(channel.id, targetId)
      : Routes.channelPermissionsMember(channel.id, targetId);

    const [effRes, rawRes] = await Promise.all([
      rest.get(route, { query: new URLSearchParams({ implicit: "true" }) }).catch(() => null),
      rest.get(route, { query: new URLSearchParams({ implicit: "false" }) }).catch(() => null),
    ]);

    if (effRes?.permissions !== undefined && rawRes?.permissions !== undefined) {
      const effectiveBits = new PermissionsBitField(BigInt(effRes.permissions));
      const rawBits = new PermissionsBitField(BigInt(rawRes.permissions));
      const effectiveList = effectiveBits.toArray().sort();
      const rawList = rawBits.toArray().sort();
      const effSet = new Set(effectiveList);
      const maskedList = rawList.filter((p) => !effSet.has(p));
      return { effectiveList, rawList, maskedList, source: "api" };
    }
  }

  const list = fallbackPerms?.toArray?.()?.sort?.() ?? [];
  return { effectiveList: list, rawList: list, maskedList: [], source: "cache" };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...options, signal });
}

function noGuildReply(ctx, message = null) {
  const isEn = getCurrentLang() === "en";
  const text = message ?? (isEn ? "This command only works in servers" : "Este comando solo funciona en servidores");
  const card = ComponentsV2Builder.card({
    description: text,
    color: RED,
    links: [{ label: isEn ? "Invite me" : "Invítame", url: INVITE_URL }],
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
const roleIconUrl = (role, size = 256) => (role?.icon ? role.iconURL?.({ size }) ?? null : null);

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
  const modLabel = getCurrentLang() === "en" ? "Moderator" : "Moderador";
  return ComponentsV2Builder.card({
    title: title ? V2Text.heading(title, 3, 200) : null,
    subtitle: subtitle ? V2Text.subtext(subtitle, 120) : null,
    description,
    fields: Array.isArray(fields) && fields.length ? fields : undefined,
    sections: Array.isArray(sections) && sections.length ? sections : undefined,
    footer: moderator ? V2Text.subtext(`${modLabel}: ${moderator}`, 200) : null,
    color,
    thumbnail,
  });
}

function failWith(ctx, err, message) {
  if (err?.code === 50013 || err?.code === 50006) return handleCommandError(ctx, err);
  commandErrorLog.error(message, {
    command: ctx?.command?.data?.name,
    err: sanitizeError(err),
  });
  return ctx.ephemeral(ComponentsV2Builder.card({ description: message, color: RED }));
}

function createListPaginator({ items, ownerId, perPage = 15, timeout = 2 * 60 * 1000, thirdPartyMode = "ephemeral-view", render }) {
  return new V2Paginator({
    items,
    perPage,
    ownerId,
    thirdPartyMode,
    thirdPartyMessage: getCurrentLang() === "en" ? "This is not your command" : "No es tu comando",
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
      if (shuttingDown) break;
      const sent = await sendDmWithRetry(members[i], { embeds: [embed], allowedMentions: { parse: [] } });
      if (sent) enviados++;
      else fallidos++;

      if ((i + 1) % 10 === 0 || i + 1 === total) await onProgress?.(i + 1, total);
      if (sent && i + 1 < total && !shuttingDown) await wait(500);
    }

    return { enviados, fallidos, total };
  } finally {
    activeBroadcasts.delete(guild.id);
  }
}

function buildDmAllLogEmbed({ author, enviados, fallidos, titulo, texto, filtros }) {
  const isEn = getCurrentLang() === "en";
  return new EmbedBuilder()
    .setTitle(isEn ? "Mass DM sent" : "DM masivo enviado")
    .setColor(RED)
    .addFields(
      { name: isEn ? "Moderator" : "Moderador", value: author.tag ?? author.username, inline: true },
      { name: isEn ? "Sent" : "Enviados", value: `\`${enviados}\``, inline: true },
      { name: isEn ? "Failed" : "Fallidos", value: `\`${fallidos}\``, inline: true },
      { name: isEn ? "Title" : "Título", value: clip(titulo), inline: false },
      { name: isEn ? "Text" : "Texto", value: clip(texto), inline: false },
      ...(filtros.length ? [{ name: isEn ? "Filters" : "Filtros", value: clip(filtros.join("\n")), inline: false }] : []),
    )
    .setTimestamp();
}

function buildDmAllEmbed({ titulo, texto, author, guild, imagenUrl }) {
  const authorAvatarUrl = author.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
  const embed = new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(texto)
    .setColor(RED)
    .setFooter({ text: `att: ${author.globalName ?? author.username}`, iconURL: authorAvatarUrl })
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
  isObfuscatedChannel,
  formatRoleColorInfo,
  fetchComputedChannelPermissions,
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
