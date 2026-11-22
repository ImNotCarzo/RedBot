const { ActivityType, ChannelType, PermissionFlagsBits, Routes } = require("discord.js");
const mongoose = require("mongoose");
const { AutopurgeRule, GuildConfig, StickyMessage, TempChannel, VoiceLink } = require("./database");
const { TtlCache } = require("./guild");
const { Logger } = require("./runtime");
const { resolveEmbedTemplate, substituteVars, buildTagVariables } = require("./tagscript");

const log = new Logger("CHANNELS_EXTRA");
const MAX_TEMP_CHANNELS_PER_GUILD = 100;
const MAX_MANAGED_VOICE_STATUS = 2000;
const stickyDebounceTimers = new Map();
const stickyInFlight = new Set();
const stickyPresenceCache = new TtlCache(60_000, 4000);
const tempChannelTimers = new Map();
const voiceAutoStatusCache = new TtlCache(2 * 60_000, 2000);
const voiceStatusTimers = new Map();
const autoManagedVoiceStatus = new Map();
let autopurgeInterval = null;
let isSweepingAutopurge = false;

function invalidateStickyCache(channelId) {
  if (channelId) stickyPresenceCache.delete(channelId);
}

async function hasActiveSticky(channelId) {
  const cached = stickyPresenceCache.get(channelId);
  if (cached !== undefined) return cached;
  const exists = Boolean(await StickyMessage.exists({ channelId, enabled: true }).catch(() => null));
  stickyPresenceCache.set(channelId, exists);
  return exists;
}

async function handleStickyOnMessage(message) {
  if (!message?.guild?.id || !message.channelId || message.author?.bot) return;
  if (mongoose.connection.readyState !== 1) return;

  const channelId = message.channelId;
  if (stickyDebounceTimers.has(channelId) || stickyInFlight.has(channelId)) return;

  stickyInFlight.add(channelId);
  let active = false;
  try {
    active = await hasActiveSticky(channelId);
  } finally {
    stickyInFlight.delete(channelId);
  }
  if (!active || stickyDebounceTimers.has(channelId)) return;

  const timer = setTimeout(async () => {
    stickyDebounceTimers.delete(channelId);
    try {
      const latest = await StickyMessage.findOne({ channelId, enabled: true }).lean();
      if (!latest) {
        stickyPresenceCache.set(channelId, false);
        return;
      }

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
        await StickyMessage.updateOne({ channelId }, { $set: { lastMessageId: sent.id } }).catch(() => {});
      }
    } catch (err) {
      log.warn("Error reenviando sticky", { channelId, err: err?.message });
    }
  }, 2500);
  timer.unref();
  stickyDebounceTimers.set(channelId, timer);
}

async function runAutopurgeSweep(client) {
  if (isSweepingAutopurge || !client?.guilds || mongoose.connection.readyState !== 1) return;
  isSweepingAutopurge = true;
  try {
    const rules = await AutopurgeRule.find().lean().catch(() => []);
    if (!rules.length) return;

    const now = Date.now();
    const ruleChannelIds = rules.map((r) => r.channelId);
    const stickyChannels = new Set(
      (await StickyMessage.find({ enabled: true, channelId: { $in: ruleChannelIds } }).select("channelId lastMessageId").lean().catch(() => []))
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
  } finally {
    isSweepingAutopurge = false;
  }
}

function scheduleTempChannelExpiry(client, guildId, channelId, expiresAt) {
  if (!expiresAt) return;
  const expMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expMs)) return;

  const existing = tempChannelTimers.get(channelId);
  if (existing) clearTimeout(existing);

  const delay = Math.min(2_147_000_000, Math.max(1000, expMs - Date.now()));
  const timer = setTimeout(async () => {
    tempChannelTimers.delete(channelId);
    try {
      if (expMs > Date.now() + 2000) {
        scheduleTempChannelExpiry(client, guildId, channelId, new Date(expMs));
        return;
      }
      if (mongoose.connection.readyState === 1) {
        const still = await TempChannel.findOne({ channelId }).lean().catch(() => null);
        if (!still) return;
        const dbExpMs = still.expiresAt ? new Date(still.expiresAt).getTime() : NaN;
        if (Number.isFinite(dbExpMs) && dbExpMs > Date.now() + 2000) {
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
  try {
    await TempChannel.create({ guildId: guild.id, channelId: ch.id, ownerId, kind: "timed", expiresAt });
  } catch (err) {
    await ch.delete("Rollback por fallo en base de datos").catch(() => {});
    throw err;
  }
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
      if (!role || role.managed || role.position >= me.roles.highest.position) continue;
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

  // Limpiar sala de Voice Hub si quedó vacía o si el canal ya fue borrado manualmente
  const leftId = oldState?.channelId;
  if (leftId && leftId !== newState?.channelId) {
    const tempDoc = await TempChannel.findOne({ channelId: leftId, kind: "voice_hub" }).lean().catch(() => null);
    if (tempDoc) {
      const ch = guild.channels.cache.get(leftId);
      if (!ch) {
        await TempChannel.deleteOne({ channelId: leftId }).catch(() => {});
      } else if (ch.members?.size === 0) {
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

      const vars = buildTagVariables(
        { user: newState.member.user, member: newState.member, guild },
        { user: newState.member.user.globalName ?? newState.member.user.username }
      );
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
            allow: [
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.SetVoiceChannelStatus,
            ],
          },
        ],
        reason: `Voice Hub temporal para ${newState.member.user.tag || newState.member.user.username}`,
      }).catch(() => null);

      if (created) {
        await TempChannel.create({ guildId: guild.id, channelId: created.id, ownerId: newState.member.id, kind: "voice_hub", expiresAt: null }).catch(() => {});
        const moved = await newState.setChannel(created).then(() => true).catch(() => false);
        if (!moved) {
          await TempChannel.deleteOne({ channelId: created.id }).catch(() => {});
          await created.delete("Usuario desconectado antes de moverlo a la sala temporal").catch(() => {});
        }
      }
    }
  }
}

const VOICE_ACTIVITY_META = {
  [ActivityType.Playing]: { icon: "🎮", priority: 5 },
  [ActivityType.Streaming]: { icon: "🔴", priority: 4 },
  [ActivityType.Competing]: { icon: "🏆", priority: 3 },
  [ActivityType.Watching]: { icon: "📺", priority: 2 },
  [ActivityType.Listening]: { icon: "🎵", priority: 1 },
};

function invalidateVoiceAutoStatusCache(guildId) {
  if (guildId) voiceAutoStatusCache.delete(guildId);
}

async function isVoiceAutoStatusEnabled(guildId) {
  if (!guildId || mongoose.connection.readyState !== 1) return false;
  const cached = voiceAutoStatusCache.get(guildId);
  if (cached !== undefined) return cached;
  const doc = await GuildConfig.findOne({ guildId }).select("voiceAutoStatus").lean().catch(() => null);
  const enabled = Boolean(doc?.voiceAutoStatus);
  voiceAutoStatusCache.set(guildId, enabled);
  return enabled;
}

function getManagedVoiceStatus(channelId) {
  return channelId ? (autoManagedVoiceStatus.get(channelId) ?? null) : null;
}

function clearManagedVoiceStatus(channelId) {
  if (channelId) autoManagedVoiceStatus.delete(channelId);
}

function rememberManagedVoiceStatus(channelId, status) {
  if (!channelId) return;
  if (!status) {
    autoManagedVoiceStatus.delete(channelId);
    return;
  }
  if (autoManagedVoiceStatus.size >= MAX_MANAGED_VOICE_STATUS && !autoManagedVoiceStatus.has(channelId)) {
    const oldest = autoManagedVoiceStatus.keys().next().value;
    if (oldest !== undefined) autoManagedVoiceStatus.delete(oldest);
  }
  autoManagedVoiceStatus.delete(channelId);
  autoManagedVoiceStatus.set(channelId, status);
}

async function setVoiceChannelStatus(client, channelId, status, reason = undefined) {
  const clean = status && String(status).trim() ? String(status).trim().slice(0, 500) : null;
  await client.rest.put(Routes.channelVoiceStatus(channelId), {
    body: { status: clean },
    ...(reason ? { reason } : {}),
  });
  return clean;
}

function computeAutoVoiceStatus(voiceChannel) {
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) return null;
  const humans = [...(voiceChannel.members?.values?.() ?? [])].filter((m) => m && !m.user?.bot);
  if (!humans.length) return null;

  const counts = new Map();
  for (const member of humans) {
    const activities = member.presence?.activities ?? [];
    const seenForMember = new Set();
    for (const act of activities) {
      const meta = VOICE_ACTIVITY_META[act?.type];
      const name = String(act?.name ?? "").trim();
      if (!meta || !name || act.type === ActivityType.Custom) continue;
      const key = `${act.type}:${name.toLowerCase()}`;
      if (seenForMember.has(key)) continue;
      seenForMember.add(key);

      const cur = counts.get(key) ?? { name, type: act.type, icon: meta.icon, priority: meta.priority, count: 0 };
      cur.count += 1;
      counts.set(key, cur);
    }
  }

  if (!counts.size) return null;
  const sorted = [...counts.values()].sort((a, b) => (b.count - a.count) || (b.priority - a.priority));
  const top = sorted[0];
  let formatted;
  if (top.count > 1) {
    formatted = `${top.icon} ${top.name} (${top.count})`;
  } else if (sorted.length > 1) {
    const second = sorted[1];
    formatted = `${top.icon} ${top.name} · ${second.icon} ${second.name}`;
  } else {
    formatted = `${top.icon} ${top.name}`;
  }
  return formatted.slice(0, 120);
}

function scheduleVoiceAutoStatusSync(voiceChannel) {
  const channelId = voiceChannel?.id;
  const guild = voiceChannel?.guild;
  if (!channelId || !guild?.id || voiceChannel.type !== ChannelType.GuildVoice) return;

  const existing = voiceStatusTimers.get(channelId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    voiceStatusTimers.delete(channelId);
    try {
      const ch = guild.channels?.cache?.get?.(channelId);
      if (!ch || ch.type !== ChannelType.GuildVoice) {
        autoManagedVoiceStatus.delete(channelId);
        return;
      }
      if (!(await isVoiceAutoStatusEnabled(guild.id))) return;

      const me = guild.members?.me ?? await guild.members?.fetchMe?.().catch(() => null);
      const perms = me ? ch.permissionsFor?.(me) : null;
      if (
        !perms?.has?.(PermissionFlagsBits.ViewChannel) ||
        (!perms?.has?.(PermissionFlagsBits.SetVoiceChannelStatus) && !perms?.has?.(PermissionFlagsBits.ManageChannels))
      ) {
        return;
      }

      const next = computeAutoVoiceStatus(ch);
      const prev = autoManagedVoiceStatus.get(channelId);
      if (next === null && prev === undefined) return;
      if (next === prev) return;

      await setVoiceChannelStatus(guild.client, channelId, next, "RedBot Auto Voice Status").catch(() => {});
      rememberManagedVoiceStatus(channelId, next);
    } catch {}
  }, 4000);
  timer.unref?.();
  voiceStatusTimers.set(channelId, timer);
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
  for (const t of voiceStatusTimers.values()) clearTimeout(t);
  voiceStatusTimers.clear();
}

module.exports = {
  invalidateStickyCache,
  handleStickyOnMessage,
  restoreTempChannels,
  createTimedTempChannel,
  applyVoiceLinksForTransition,
  handleVoiceHubTransition,
  invalidateVoiceAutoStatusCache,
  isVoiceAutoStatusEnabled,
  getManagedVoiceStatus,
  clearManagedVoiceStatus,
  setVoiceChannelStatus,
  scheduleVoiceAutoStatusSync,
  startChannelsWorkers,
  stopChannelsWorkers,
};
