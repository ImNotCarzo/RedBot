const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const Logger = require("../../src/logger");
const { RED } = require("../../utils/colors");
const { clampPage, paginateArray, buildPaginationRow, buildPagRow, uniqueCollectorId } = require("./pagination");

const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";
const SUPPORT_URL = "https://discord.gg/b8AKKaNWU6";

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
  const buf = await res.arrayBuffer();
  return {
    inlineData: {
      mimeType: res.headers.get("content-type") || "image/png",
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
  createCommandLogger,
  clampPage,
  paginateArray,
  buildPaginationRow,
  buildPagRow,
  uniqueCollectorId,
  uniqueId: uniqueCollectorId,
  formatPermissionName,
  fetchWithTimeout,
  fetchImageAsInlineData,
  prepareReply,
  noGuildReply,
  handleCommandError,
  checkBotPermissions,
};
