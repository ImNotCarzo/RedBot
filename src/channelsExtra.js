const { ChannelType, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const { AutopurgeRule, GuildConfig, StickyMessage, TempChannel, VoiceLink } = require("./database");
const { Logger } = require("./runtime");
const { resolveEmbedTemplate, substituteVars, buildTagVariables } = require("./tagscript");

const log = new Logger("CHANNELS_EXTRA", process.env.LOG_LEVEL);
const MAX_TEMP_CHANNELS_PER_GUILD = 100;
const stickyDebounceTimers = new Map();
const tempChannelTimers = new Map();
let autopurgeInterval = null;

async function handleStickyOnMessage(message) {
  if (!message?.guild?.id || !message.channelId || message.author?.bot) return;
  if (mongoose.connection.readyState !== 1) return;

  const sticky = await StickyMessage.findOne({ channelId: message.channelId, enabled: true }).lean().catch(() => null);
  if (!sticky) return;

  if (stickyDebounceTimers.has(message.channelId)) return;

  const timer = setTimeout(async () => {
    stickyDebounceTimers.delete(message.channelId);
    try {
      const latest = await StickyMessage.findOne({ channelId: message.channelId, enabled: true }).lean();
      if (!latest) return;

      const ch = message.channel;
      if (!ch?.isTextBased?.()) return;

      if (latest.lastMessageId) {
        await ch.messages.delete(latest.lastMessageId).catch(() => {});
      }

      let sent = null;
      if (latest.templateName) {
        const embed = await resolveEmbedTemplate(latest.guildId, latest.templateName, { guild: message.guild, channel: ch });
        if (embed) {
          sent = await ch.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
        }
      }
      if (!sent && latest.content) {
        sent = await ch.send({ content: latest.content, allowedMentions: { parse: [] } }).catch(() => null);
      }

      if (sent?.id) {
        await StickyMessage.updateOne({ channelId: message.channelId }, { $set: { lastMessageId: sent.id } }).catch(() => {});
      }
    } catch (err) {
      log.warn("Error reenviando sticky", { channelId: message.channelId, err: err?.message });
    }
  }, 2500);
  timer.unref();
  stickyDebounceTimers.set(message.channelId, timer);
}

async function runAutopurgeSweep(client) {
  if (!client?.guilds || mongoose.connection.readyState !== 1) return;
  const rules = await AutopurgeRule.find().lean().catch(() => []);
  if (!rules.length) return;

  const now = Date.now();
  const stickyChannels = new Set(
    (await StickyMessage.find({ enabled: true }).select("channelId lastMessageId").lean().catch(() => []))
      .map((s) => `${s.channelId}:${s.lastMessageId}`)
  );

  for (const rule of rules) {
    try {
      const ch = client.channels?.cache?.get(rule.channelId) ?? await client.channels?.fetch?.(rule.channelId).catch(() => null);
      if (!ch?.isTextBased?.()) continue;

      const cutoff = now - Math.max(10_000, rule.maxAgeMs);
      const fetched = await ch.messages.fetch({ limit: 50 }).catch(() => null);
      if (!fetched?.size) continue;

      const expired = [...fetched.values()].filter((m) => {
        if (m.createdTimestamp > cutoff) return false;
        if (rule.ignorePinned && m.pinned) return false;
        if (rule.filter === "bots" && !m.author?.bot) return false;
        if (rule.filter === "humans" && m.author?.bot) return false;
        if (stickyChannels.has(`${rule.channelId}:${m.id}`)) return false;
        return true;
      });

      if (!expired.length) continue;

      const bulkCutoff = now - 14 * 86_400_000 + 60_000;
      const bulkEligible = expired.filter((m) => m.createdTimestamp > bulkCutoff);
      const oldSingle = expired.filter((m) => m.createdTimestamp <= bulkCutoff);

      if (bulkEligible.length >= 2 && typeof ch.bulkDelete === "function") {
        await ch.bulkDelete(bulkEligible, true).catch(() => {});
      } else {
        for (const m of bulkEligible) await m.delete().catch(() => {});
      }
      for (const m of oldSingle.slice(0, 10)) {
        await m.delete().catch(() => {});
      }
    } catch {}
  }
}

function scheduleTempChannelExpiry(client, guildId, channelId, expiresAt) {
  if (!expiresAt) return;
  const existing = tempChannelTimers.get(channelId);
  if (existing) clearTimeout(existing);

  const delay = Math.min(2_147_000_000, Math.max(1000, new Date(expiresAt).getTime() - Date.now()));
  const timer = setTimeout(async () => {
    tempChannelTimers.delete(channelId);
    try {
      if (mongoose.connection.readyState === 1) {
        const still = await TempChannel.findOne({ channelId }).lean().catch(() => null);
        if (!still) return;
        if (still.expiresAt && new Date(still.expiresAt).getTime() > Date.now() + 2000) {
          scheduleTempChannelExpiry(client, guildId, channelId, still.expiresAt);
          return;
        }
        await TempChannel.deleteOne({ channelId }).catch(() => {});
      }
      const ch = client.channels?.cache?.get(channelId) ?? await client.channels?.fetch?.(channelId).catch(() => null);
      if (ch) await ch.delete("Canal temporal expirado").catch(() => {});
    } catch {}
  }, delay);
  timer.unref();
  tempChannelTimers.set(channelId, timer);
}

async function restoreTempChannels(client) {
  if (mongoose.connection.readyState !== 1) return;
  const rows = await TempChannel.find({ expiresAt: { $ne: null } }).lean().catch(() => []);
  for (const r of rows) {
    scheduleTempChannelExpiry(client, r.guildId, r.channelId, r.expiresAt);
  }
}

async function createTimedTempChannel({ client, guild, name, type = ChannelType.GuildText, durationMs, ownerId = null, parentId = null }) {
  if (mongoose.connection.readyState !== 1) return { error: "db" };
  const count = await TempChannel.countDocuments({ guildId: guild.id }).catch(() => 0);
  if (count >= MAX_TEMP_CHANNELS_PER_GUILD) {
    return { error: "limit", max: MAX_TEMP_CHANNELS_PER_GUILD };
  }

  const ch = await guild.channels.create({
    name: String(name || "temporal").slice(0, 90),
    type,
    parent: parentId ?? undefined,
    reason: `Canal temporal creado por ${ownerId ?? "RedBot"}`,
  });

  const expiresAt = new Date(Date.now() + durationMs);
  await TempChannel.create({ guildId: guild.id, channelId: ch.id, ownerId, kind: "timed", expiresAt });
  scheduleTempChannelExpiry(client, guild.id, ch.id, expiresAt);
  return { ok: true, channel: ch, expiresAt };
}

async function applyVoiceLinksForTransition(member, oldChannelId, newChannelId) {
  if (!member?.guild?.id || mongoose.connection.readyState !== 1) return;
  const links = await VoiceLink.find({ guildId: member.guild.id }).lean().catch(() => []);
  if (!links.length) return;

  const guild = member.guild;
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);

  for (const link of links) {
    const matchesOld = link.voiceChannelId === "any" ? Boolean(oldChannelId) : link.voiceChannelId === oldChannelId;
    const matchesNew = link.voiceChannelId === "any" ? Boolean(newChannelId) : link.voiceChannelId === newChannelId;
    if (matchesOld === matchesNew) continue;

    if (link.targetType === "text") {
      if (!me?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) continue;
      const textCh = guild.channels.cache.get(link.targetId) ?? await guild.channels.fetch(link.targetId).catch(() => null);
      if (!textCh?.permissionOverwrites) continue;
      if (matchesNew) {
        await textCh.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true }, { reason: "Voice-Text Link" }).catch(() => {});
      } else {
        await textCh.permissionOverwrites.delete(member.id, "Voice-Text Unlink").catch(() => {});
      }
    } else if (link.targetType === "role") {
      if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) continue;
      const role = guild.roles.cache.get(link.targetId);
      if (!role || role.position >= me.roles.highest.position) continue;
      if (matchesNew && !member.roles.cache.has(role.id)) {
        await member.roles.add(role, "Voice-Role Link").catch(() => {});
      } else if (!matchesNew && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, "Voice-Role Unlink").catch(() => {});
      }
    }
  }
}

async function handleVoiceHubTransition(oldState, newState) {
  const guild = newState?.guild ?? oldState?.guild;
  if (!guild?.id || mongoose.connection.readyState !== 1) return;

  // Limpiar sala de Voice Hub si quedó vacía
  const leftId = oldState?.channelId;
  if (leftId && leftId !== newState?.channelId) {
    const tempDoc = await TempChannel.findOne({ channelId: leftId, kind: "voice_hub" }).lean().catch(() => null);
    if (tempDoc) {
      const ch = guild.channels.cache.get(leftId);
      if (ch && ch.members?.size === 0) {
        await TempChannel.deleteOne({ channelId: leftId }).catch(() => {});
        await ch.delete("Sala temporal de voz vacía").catch(() => {});
      }
    }
  }

  // Crear sala dinámica al entrar al Voice Hub
  const joinedId = newState?.channelId;
  if (joinedId && joinedId !== oldState?.channelId && newState?.member && !newState.member.user?.bot) {
    const cfgDoc = await GuildConfig.findOne({ guildId: guild.id }).select("voiceHubId voiceHubCategoryId voiceHubTemplate").lean().catch(() => null);
    if (cfgDoc?.voiceHubId && cfgDoc.voiceHubId === joinedId) {
      const count = await TempChannel.countDocuments({ guildId: guild.id }).catch(() => 0);
      if (count >= MAX_TEMP_CHANNELS_PER_GUILD) return;

      const vars = buildTagVariables({ user: newState.member.user, member: newState.member, guild });
      const roomName = substituteVars(cfgDoc.voiceHubTemplate || "Sala de {user.username}", vars).slice(0, 90) || `Sala-${newState.member.user.username}`;
      const hubChannel = guild.channels.cache.get(joinedId);
      const parentId = cfgDoc.voiceHubCategoryId ?? hubChannel?.parentId ?? undefined;

      const created = await guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: parentId,
        permissionOverwrites: [
          {
            id: newState.member.id,
            allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect],
          },
        ],
        reason: `Voice Hub temporal para ${newState.member.user.tag || newState.member.user.username}`,
      }).catch(() => null);

      if (created) {
        await TempChannel.create({ guildId: guild.id, channelId: created.id, ownerId: newState.member.id, kind: "voice_hub", expiresAt: null }).catch(() => {});
        await newState.setChannel(created).catch(() => {});
      }
    }
  }
}

function startChannelsWorkers(client) {
  if (autopurgeInterval) clearInterval(autopurgeInterval);
  autopurgeInterval = setInterval(() => {
    runAutopurgeSweep(client).catch(() => {});
  }, 30_000);
  autopurgeInterval.unref();
}

function stopChannelsWorkers() {
  if (autopurgeInterval) {
    clearInterval(autopurgeInterval);
    autopurgeInterval = null;
  }
  for (const t of stickyDebounceTimers.values()) clearTimeout(t);
  stickyDebounceTimers.clear();
  for (const t of tempChannelTimers.values()) clearTimeout(t);
  tempChannelTimers.clear();
}

module.exports = {
  MAX_TEMP_CHANNELS_PER_GUILD,
  handleStickyOnMessage,
  runAutopurgeSweep,
  scheduleTempChannelExpiry,
  restoreTempChannels,
  createTimedTempChannel,
  applyVoiceLinksForTransition,
  handleVoiceHubTransition,
  startChannelsWorkers,
  stopChannelsWorkers,
};
