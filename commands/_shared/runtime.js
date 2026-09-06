const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const Logger = require("../../src/logger");
const { RED } = require("../../utils/colors");

const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";
const SUPPORT_URL = "https://discord.gg/b8AKKaNWU6";

function createCommandLogger(label) {
  return new Logger(label, process.env.LOG_LEVEL);
}

function clampPage(page, totalPages) {
  if (!Number.isFinite(page) || !Number.isFinite(totalPages) || totalPages <= 0) return 0;
  if (page < 0) return 0;
  if (page >= totalPages) return totalPages - 1;
  return page;
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

module.exports = {
  INVITE_URL,
  SUPPORT_URL,
  createCommandLogger,
  clampPage,
  fetchWithTimeout,
  prepareReply,
  noGuildReply,
};
