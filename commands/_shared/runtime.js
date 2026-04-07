const Logger = require("../../src/core/logger");

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

module.exports = { createCommandLogger, clampPage, fetchWithTimeout, prepareReply };
