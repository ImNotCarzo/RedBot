const { DISCORD_ID_PATTERN } = require("../utils/validators");

/**
 * Resolve a channel from a guild using a mention, snowflake ID, or name fragment.
 *
 * @param {import("erine").Context} ctx   - Erine command context (must have `ctx.guild`).
 * @param {string|null} input             - Raw user input.
 * @returns {Promise<import("discord.js").GuildChannel|null>}
 */
async function resolveChannelFlexible(ctx, input) {
  if (!ctx?.guild || !input) return null;

  const mention    = input.match(/^<#(\d{17,20})>$/)?.[1];
  const channelId  = mention ?? (DISCORD_ID_PATTERN.test(input) ? input : null);

  if (channelId) {
    const byId = await ctx.guild.channels.fetch(channelId).catch(() => null);
    if (byId) return byId;
  }

  const lower = input.toLowerCase();
  return ctx.guild.channels.cache.find((c) => c.name?.toLowerCase?.().includes(lower)) ?? null;
}

module.exports = { resolveChannelFlexible };
