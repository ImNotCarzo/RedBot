function generateId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[match[2]];
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function resolveMember(ctx, input) {
  if (!input) return null;
  if (ctx.message?.mentions?.members?.size) return ctx.message.mentions.members.first();
  if (/^\d{17,20}$/.test(input)) {
    const byId = await ctx.guild.members.fetch(input).catch(() => null);
    if (byId) return byId;
  }
  const results = await ctx.guild.members.fetch({ query: input, limit: 1 }).catch(() => null);
  if (results?.size) return results.first();
  return null;
}

async function resolveMemberFlexible(ctx, input) {
  if (!ctx?.guild) return null;
  if (!input) return ctx.member ?? null;
  if (typeof input === "object") return input;

  const member = await resolveMember(ctx, input);
  if (member) return member;

  const lower = input.toLowerCase();
  return ctx.guild.members.cache.find((m) => {
    const username = m.user.username?.toLowerCase() ?? "";
    const globalName = m.user.globalName?.toLowerCase() ?? "";
    const nickname = m.nickname?.toLowerCase() ?? "";
    return username.includes(lower) || globalName.includes(lower) || nickname.includes(lower);
  }) ?? null;
}

const TempBan = require("../models/TempBan");

function scheduleTempUnban(client, guildId, userId, unbanAt) {
  const delay = unbanAt.getTime() - Date.now();

  const execute = async () => {
    try {
      let existing = null;
      try {
        const doc = await TempBan.findOne({ guildId, userId });
        existing = !!doc;
      } catch (err) {
        console.error("[TempBan] No se pudo verificar registro antes de unban:", err?.message ?? err);
      }
      if (existing === false) return;
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;
      await guild.members.unban(userId, "Tempban expirado");
      await TempBan.deleteOne({ guildId, userId });
    } catch {
      await TempBan.deleteOne({ guildId, userId }).catch(() => {});
    }
  };

  if (delay <= 0) {
    void execute();
    return;
  }
  const timeout = setTimeout(() => {
    void execute();
  }, delay);
  timeout.unref();
}

module.exports = { generateId, parseDuration, formatDuration, resolveMember, resolveMemberFlexible, scheduleTempUnban };
