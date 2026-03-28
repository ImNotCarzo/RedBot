const { DISCORD_ID_PATTERN } = require("../utils/validators");

/**
 * Resolve a role from a guild using a mention, snowflake ID, or name fragment.
 *
 * @param {import("erine").Context} ctx   - Erine command context (must have `ctx.guild`).
 * @param {string|null} input             - Raw user input.
 * @returns {Promise<import("discord.js").Role|null>}
 */
async function resolveRoleFlexible(ctx, input) {
  if (!ctx?.guild || !input) return null;

  const mention  = input.match(/^<@&(\d{17,20})>$/)?.[1];
  const roleId   = mention ?? (DISCORD_ID_PATTERN.test(input) ? input : null);

  if (roleId) {
    const byId = await ctx.guild.roles.fetch(roleId).catch(() => null);
    if (byId) return byId;
  }

  const lower = input.toLowerCase();
  return ctx.guild.roles.cache.find((r) => r.name.toLowerCase().includes(lower)) ?? null;
}

module.exports = { resolveRoleFlexible };
