const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const Logger = require("../../src/logger");
const { RED } = require("../../utils/colors");
const CLIENT_ID = process.env.CLIENT_ID || "1020772849906098186";
const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}`;
const SUPPORT_URL = "https://discord.gg/b8AKKaNWU6";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const THINKING_TEXT = "<a:typing:1484407380291616778>  RedBot está pensando...";

function clampPage(page, totalPages) {
  if (!Number.isFinite(page) || !Number.isFinite(totalPages) || totalPages <= 0) return 0;
  if (page < 0) return 0;
  if (page >= totalPages) return totalPages - 1;
  return page;
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

function uniqueCollectorId(prefix = "collector") {
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

async function editThinkingReply(thinking, payload) {
  if (!thinking) return null;
  return thinking.edit(payload);
}

function createCommandLogger(label) {
  return new Logger(label, process.env.LOG_LEVEL);
}

function formatPermissionName(p) {
  if (!p) return "";
  return `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}\``;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...options, signal });
}

async function prepareReply(ctx) {
  if (ctx.interaction) {
    await ctx.interaction.deferReply();
    return (payload) => ctx.interaction.editReply(payload);
  }
  return (payload) => ctx.send(payload);
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

async function fetchImageAsInlineData(url, timeoutMs = 10_000) {
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error("La imagen supera el tamaño máximo permitido");

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("La imagen supera el tamaño máximo permitido");

  return {
    inlineData: {
      mimeType: (res.headers.get("content-type") || "image/png").split(";")[0].trim(),
      data: Buffer.from(buf).toString("base64"),
    },
  };
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

const commandErrorLog = createCommandLogger("CMD_ERROR");

/**
 * Cierre estándar de los `catch` de comandos: los errores de permisos de Discord
 * (50013/50006) se delegan al handler del framework; el resto se loguea y se
 * responde con `message`.
 */
function failWith(ctx, err, message, send = (payload) => ctx.send(payload)) {
  if (err?.code === 50013 || err?.code === 50006) return handleCommandError(ctx, err);
  commandErrorLog.error(message, {
    command: ctx?.command?.data?.name,
    err: err?.stack || err?.message || String(err),
  });
  return send({ content: message, flags: MessageFlags.Ephemeral });
}

function checkBotPermissions(ctx, ...permissions) {
  if (!ctx?.guild) return true;
  const me = ctx.guild.members?.me ?? (ctx.bot?.user?.id ? ctx.guild.members.cache.get(ctx.bot.user.id) : null);
  const channel = ctx.channel;
  const channelPerms = channel?.permissionsFor ? channel.permissionsFor(me || ctx.bot?.user) : null;
  if (!channelPerms) return true;

  const missing = permissions.filter((p) => !channelPerms.has(p));
  if (missing.length > 0) {
    const { Errors } = require("gralonium");
    const err = new Errors.MissingBotChannelPermission(ctx, missing, channel);
    handleCommandError(ctx, err);
    return false;
  }
  return true;
}

module.exports = {
  INVITE_URL,
  SUPPORT_URL,
  THINKING_TEXT,
  createCommandLogger,
  clampPage,
  paginateArray,
  buildPaginationRow,
  buildPagRow: buildPaginationRow,
  uniqueCollectorId,
  uniqueId: uniqueCollectorId,
  sendThinkingReply,
  editThinkingReply,
  formatPermissionName,
  fetchWithTimeout,
  fetchImageAsInlineData,
  prepareReply,
  noGuildReply,
  handleCommandError,
  failWith,
  checkBotPermissions,
};

