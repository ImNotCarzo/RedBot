const { PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const { Birthday, GuildConfig, InviteJoin, InviteReward, InviteStat } = require("./database");
const { grantTempRole } = require("./reactionRoles");
const { Logger } = require("./runtime");
const { resolveEmbedTemplate, substituteVars, buildTagVariables } = require("./tagscript");

const log = new Logger("COMMUNITY", process.env.LOG_LEVEL);
const inviteCache = new Map(); // guildId -> Map<code, { uses, inviterId }>
let birthdayInterval = null;

async function snapshotGuildInvites(guild) {
  if (!guild?.id || !guild.members?.me?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return;
  const fetched = await guild.invites?.fetch?.().catch(() => null);
  if (!fetched) return;
  const map = new Map();
  for (const inv of fetched.values()) {
    map.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviterId ?? inv.inviter?.id ?? null });
  }
  inviteCache.set(guild.id, map);
}

async function snapshotAllInvites(client) {
  if (!client?.guilds?.cache) return;
  for (const guild of client.guilds.cache.values()) {
    await snapshotGuildInvites(guild).catch(() => {});
  }
}

function cacheInviteEntry(invite) {
  if (!invite?.guild?.id || !invite.code) return;
  const map = inviteCache.get(invite.guild.id) ?? new Map();
  map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviterId ?? invite.inviter?.id ?? null });
  inviteCache.set(invite.guild.id, map);
}

function removeCachedInvite(invite) {
  if (!invite?.guild?.id || !invite.code) return;
  inviteCache.get(invite.guild.id)?.delete(invite.code);
}

async function syncInviteRewards(member, inviterId) {
  if (!member?.guild?.id || !inviterId || mongoose.connection.readyState !== 1) return;
  const stat = await InviteStat.findOne({ guildId: member.guild.id, userId: inviterId }).lean().catch(() => null);
  if (!stat) return;
  const totalInvites = (stat.regular || 0) + (stat.bonus || 0) - (stat.left || 0) - (stat.fake || 0);

  const rewards = await InviteReward.find({ guildId: member.guild.id, invitesRequired: { $lte: totalInvites } }).lean().catch(() => []);
  if (!rewards.length) return;

  const inviterMember = await member.guild.members.fetch(inviterId).catch(() => null);
  const me = member.guild.members.me ?? await member.guild.members.fetchMe().catch(() => null);
  if (!inviterMember || !me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return;

  for (const rw of rewards) {
    const role = member.guild.roles.cache.get(rw.roleId);
    if (role && role.position < me.roles.highest.position && !inviterMember.roles.cache.has(role.id)) {
      await inviterMember.roles.add(role, `Recompensa por ${rw.invitesRequired} invitaciones`).catch(() => {});
    }
  }
}

async function trackMemberJoinInvite(member) {
  const guild = member?.guild;
  if (!guild?.id || member.user?.bot) return null;
  if (!guild.members?.me?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return null;

  const prev = inviteCache.get(guild.id) ?? new Map();
  const currentInvites = await guild.invites?.fetch?.().catch(() => null);
  if (!currentInvites) return null;

  let used = null;
  const nextMap = new Map();
  for (const inv of currentInvites.values()) {
    const oldUses = prev.get(inv.code)?.uses ?? 0;
    nextMap.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviterId ?? inv.inviter?.id ?? null });
    if ((inv.uses ?? 0) > oldUses) {
      used = inv;
    }
  }
  inviteCache.set(guild.id, nextMap);

  const inviterId = used?.inviterId ?? used?.inviter?.id ?? null;
  if (!inviterId || mongoose.connection.readyState !== 1) return { inviterId, code: used?.code ?? null, total: null };

  const isFake = (Date.now() - (member.user?.createdTimestamp ?? 0)) < 7 * 86_400_000;
  await InviteJoin.findOneAndUpdate(
    { guildId: guild.id, memberId: member.id },
    { $set: { inviterId, code: used?.code ?? null, isFake } },
    { upsert: true, returnDocument: "after" }
  ).catch(() => {});

  const stat = await InviteStat.findOneAndUpdate(
    { guildId: guild.id, userId: inviterId },
    { $inc: isFake ? { fake: 1 } : { regular: 1 } },
    { upsert: true, returnDocument: "after" }
  ).lean().catch(() => null);

  await syncInviteRewards(member, inviterId).catch(() => {});
  const total = stat ? (stat.regular || 0) + (stat.bonus || 0) - (stat.left || 0) - (stat.fake || 0) : null;
  return { inviterId, code: used?.code ?? null, total };
}

async function trackMemberLeaveInvite(member) {
  if (!member?.guild?.id || !member.id || mongoose.connection.readyState !== 1) return;
  const join = await InviteJoin.findOneAndDelete({ guildId: member.guild.id, memberId: member.id }).lean().catch(() => null);
  if (!join?.inviterId) return;

  await InviteStat.updateOne(
    { guildId: member.guild.id, userId: join.inviterId },
    { $inc: join.isFake ? { fake: -1 } : { left: 1 } }
  ).catch(() => {});
}

async function getMemberInviteStats(guildId, userId) {
  if (!guildId || !userId || mongoose.connection.readyState !== 1) {
    return { regular: 0, fake: 0, bonus: 0, left: 0, total: 0 };
  }
  const s = await InviteStat.findOne({ guildId, userId }).lean().catch(() => null);
  const regular = s?.regular ?? 0;
  const fake = s?.fake ?? 0;
  const bonus = s?.bonus ?? 0;
  const left = s?.left ?? 0;
  return { regular, fake, bonus, left, total: regular + bonus - fake - left };
}

async function sendWelcomeOrGoodbye(member, kind, inviteInfo = null) {
  const guild = member?.guild;
  if (!guild?.id || mongoose.connection.readyState !== 1) return;

  const field = kind === "goodbye" ? "goodbyeConfig" : "welcomeConfig";
  const doc = await GuildConfig.findOne({ guildId: guild.id }).select(field).lean().catch(() => null);
  const cfg = doc?.[field];
  if (!cfg?.enabled) return;

  const extraVars = {};
  if (inviteInfo?.inviterId) {
    extraVars.inviter = `<@${inviteInfo.inviterId}>`;
    extraVars.invites = String(inviteInfo.total ?? 0);
  } else {
    extraVars.inviter = "Desconocido";
    extraVars.invites = "0";
  }

  const ctx = { user: member.user, member, guild };

  if (cfg.channelId) {
    const ch = guild.channels.cache.get(cfg.channelId) ?? await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (ch?.isTextBased?.()) {
      const embeds = [];
      if (cfg.templateName) {
        const emb = await resolveEmbedTemplate(guild.id, cfg.templateName, ctx, extraVars);
        if (emb) embeds.push(emb);
      }
      const vars = buildTagVariables(ctx, extraVars);
      const content = cfg.message ? substituteVars(cfg.message, vars) : "";
      if (content || embeds.length) {
        await ch.send({
          ...(content ? { content } : {}),
          ...(embeds.length ? { embeds } : {}),
          allowedMentions: { users: [member.id] },
        }).catch(() => {});
      }
    }
  }

  if (kind === "welcome" && cfg.dmEnabled && cfg.dmMessage && !member.user?.bot) {
    const vars = buildTagVariables(ctx, extraVars);
    await member.user.send({ content: substituteVars(cfg.dmMessage, vars) }).catch(() => {});
  }
}

async function checkBirthdaysToday(client) {
  if (!client?.guilds || mongoose.connection.readyState !== 1) return;
  const now = new Date();
  const day = now.getUTCDate();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  const due = await Birthday.find({
    day,
    month,
    lastCelebratedYear: { $ne: year },
  }).lean().catch(() => []);

  for (const b of due) {
    try {
      await Birthday.updateOne({ _id: b._id }, { $set: { lastCelebratedYear: year } }).catch(() => {});
      const guild = client.guilds.cache.get(b.guildId) ?? await client.guilds.fetch(b.guildId).catch(() => null);
      if (!guild) continue;

      const cfgDoc = await GuildConfig.findOne({ guildId: guild.id }).select("birthdayConfig").lean().catch(() => null);
      const cfg = cfgDoc?.birthdayConfig;
      if (!cfg?.enabled) continue;

      const member = await guild.members.fetch(b.userId).catch(() => null);
      if (!member) continue;

      if (cfg.roleId) {
        const role = guild.roles.cache.get(cfg.roleId);
        const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
        if (role && me?.permissions?.has?.(PermissionFlagsBits.ManageRoles) && role.position < me.roles.highest.position) {
          await grantTempRole({ client, guild, member, role, durationMs: 24 * 60 * 60_000, source: "birthday" }).catch(() => {});
        }
      }

      if (cfg.channelId) {
        const ch = guild.channels.cache.get(cfg.channelId) ?? await guild.channels.fetch(cfg.channelId).catch(() => null);
        if (ch?.isTextBased?.()) {
          const age = b.year ? String(year - b.year) : "";
          const vars = buildTagVariables({ user: member.user, member, guild, channel: ch }, { age });
          const text = substituteVars(cfg.message || "🎂 ¡Feliz cumpleaños {user}!", vars);
          await ch.send({ content: text, allowedMentions: { users: [member.id] } }).catch(() => {});
        }
      }
    } catch (err) {
      log.warn("Error celebrando cumpleaños", { err: err?.message });
    }
  }
}

function startCommunityWorkers(client) {
  if (birthdayInterval) clearInterval(birthdayInterval);
  birthdayInterval = setInterval(() => {
    checkBirthdaysToday(client).catch(() => {});
  }, 15 * 60_000);
  birthdayInterval.unref();
}

function stopCommunityWorkers() {
  if (birthdayInterval) {
    clearInterval(birthdayInterval);
    birthdayInterval = null;
  }
}

module.exports = {
  snapshotGuildInvites,
  snapshotAllInvites,
  cacheInviteEntry,
  removeCachedInvite,
  trackMemberJoinInvite,
  trackMemberLeaveInvite,
  getMemberInviteStats,
  sendWelcomeOrGoodbye,
  checkBirthdaysToday,
  startCommunityWorkers,
  stopCommunityWorkers,
};
