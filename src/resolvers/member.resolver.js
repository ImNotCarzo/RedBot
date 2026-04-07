async function resolveMember(ctx, input) {
  if (!ctx?.guild || !input) return null;

  if (ctx.message?.mentions?.members?.size) {
    return ctx.message.mentions.members.first() ?? null;
  }

  const token = String(input).trim();
  if (/^\d{17,20}$/.test(token)) {
    const byId = await ctx.guild.members.fetch(token).catch(() => null);
    if (byId) return byId;
  }

  const byQuery = await ctx.guild.members.fetch({ query: token, limit: 1 }).catch(() => null);
  if (byQuery?.size) return byQuery.first();
  return null;
}

async function resolveMemberFlexible(ctx, input) {
  if (!ctx?.guild) return null;
  if (!input) return ctx.member ?? null;
  if (typeof input === "object" && input?.id) return input;

  const member = await resolveMember(ctx, input);
  if (member) return member;

  const lower = String(input).toLowerCase();
  return ctx.guild.members.cache.find((m) => {
    const username = m.user.username?.toLowerCase() ?? "";
    const globalName = m.user.globalName?.toLowerCase() ?? "";
    const nickname = m.nickname?.toLowerCase() ?? "";
    return username.includes(lower) || globalName.includes(lower) || nickname.includes(lower);
  }) ?? null;
}

module.exports = { resolveMember, resolveMemberFlexible };
