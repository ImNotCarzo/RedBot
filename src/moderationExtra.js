const { PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const { ComponentsV2Builder, V2Text } = require("gralonium");
const { RED, YELLOW, GREEN } = require("./config");
const { GuildConfig } = require("./database");
const { logAction, TtlCache } = require("./guild");
const { addModCase, addWarn } = require("./moderation");
const { Logger } = require("./runtime");
const { substituteVars, buildTagVariables } = require("./tagscript");

const log = new Logger("MOD_EXTRA", process.env.LOG_LEVEL);
const spamTracker = new Map();
const dramaInFlight = new Set();
const automodConfigCache = new TtlCache(2 * 60_000, 2000);
const dramaChannelCache = new TtlCache(2 * 60_000, 2000);

const DRAMA_EMOJIS = {
  "🔨": "ban",
  "👢": "kick",
  "🔇": "mute",
  "⚠️": "warn",
  "✅": "ignore",
};
const VALID_DRAMA_ACTIONS = new Set(Object.values(DRAMA_EMOJIS));

const AUTOMOD_DEFAULTS = {
  enabled: false,
  antiSpam: false,
  antiLinks: false,
  antiInvites: false,
  antiCaps: false,
  antiMentions: false,
  blockedWords: [],
  action: "warn",
  muteMs: 5 * 60 * 1000,
  customMessage: "",
  ignoredChannels: [],
  ignoredRoles: [],
};

async function getAutomodConfig(guildId) {
  if (!guildId || mongoose.connection.readyState !== 1) return { ...AUTOMOD_DEFAULTS };
  const cached = automodConfigCache.get(guildId);
  if (cached !== undefined) return cached;
  try {
    const doc = await GuildConfig.findOne({ guildId }).select("automodConfig").lean();
    const cfg = { ...AUTOMOD_DEFAULTS, ...(doc?.automodConfig || {}) };
    automodConfigCache.set(guildId, cfg);
    return cfg;
  } catch {
    return { ...AUTOMOD_DEFAULTS };
  }
}

async function updateAutomodConfig(guildId, patch) {
  if (!guildId || mongoose.connection.readyState !== 1) return null;
  const setObj = {};
  for (const [k, v] of Object.entries(patch)) setObj[`automodConfig.${k}`] = v;
  const doc = await GuildConfig.findOneAndUpdate(
    { guildId },
    { $set: setObj },
    { upsert: true, returnDocument: "after" }
  ).lean();
  const updated = doc?.automodConfig ? { ...AUTOMOD_DEFAULTS, ...doc.automodConfig } : null;
  if (updated) automodConfigCache.set(guildId, updated);
  else automodConfigCache.delete(guildId);
  return updated;
}

function invalidateDramaChannelCache(guildId) {
  if (guildId) dramaChannelCache.delete(guildId);
}

async function getDramaChannelId(guildId) {
  if (!guildId || mongoose.connection.readyState !== 1) return null;
  const cached = dramaChannelCache.get(guildId);
  if (cached !== undefined) return cached;
  const doc = await GuildConfig.findOne({ guildId }).select("dramaChannelId").lean().catch(() => null);
  const id = doc?.dramaChannelId ?? null;
  dramaChannelCache.set(guildId, id);
  return id;
}

async function postToDramaWatcher({ guild, targetUser, channelId = null, reason, ruleName = "AutoMod", excerpt = "" }) {
  if (!guild?.id || !targetUser?.id) return null;
  const dramaChannelId = await getDramaChannelId(guild.id);
  if (!dramaChannelId) return null;

  const ch = guild.channels.cache.get(dramaChannelId) ?? await guild.channels.fetch(dramaChannelId).catch(() => null);
  if (!ch?.isTextBased?.()) return null;

  const builder = new ComponentsV2Builder({ color: YELLOW })
    .addSection(
      [
        V2Text.heading(`Drama Watcher · ${ruleName}`, 3, 200),
        V2Text.subtext(`${targetUser.tag || targetUser.username} (${targetUser.id})`),
      ],
      { thumbnail: targetUser.displayAvatarURL?.({ size: 256 }) ?? null, fallbackToText: true }
    )
    .addSeparator("small")
    .addFields([
      ["Usuario", `<@${targetUser.id}>`],
      channelId ? ["Canal", `<#${channelId}>`] : null,
      ["Motivo", V2Text.clip(reason || ruleName, 300)],
      excerpt ? ["Contenido", V2Text.quote(excerpt, 500)] : null,
    ].filter(Boolean))
    .addSpacer("small")
    .addButtonsRow([
      { customId: `drama:ban:${targetUser.id}`, emoji: "🔨", label: "Ban", style: "danger" },
      { customId: `drama:kick:${targetUser.id}`, emoji: "👢", label: "Kick", style: "danger" },
      { customId: `drama:mute:${targetUser.id}`, emoji: "🔇", label: "Mute 10m", style: "secondary" },
      { customId: `drama:warn:${targetUser.id}`, emoji: "⚠️", label: "Warn", style: "secondary" },
      { customId: `drama:ignore:${targetUser.id}`, emoji: "✅", label: "Ignorar", style: "secondary" },
    ]);

  const sent = await ch.send(builder.toPayload()).catch(() => null);
  if (sent) {
    for (const em of Object.keys(DRAMA_EMOJIS)) {
      await sent.react(em).catch(() => {});
    }
  }
  return sent;
}

async function executeDramaAction({ guild, modMember, modUser, targetId, action, message = null }) {
  if (!VALID_DRAMA_ACTIONS.has(action)) return { error: "invalid_action" };

  const lockKey = message?.id ? String(message.id) : null;
  if (lockKey && dramaInFlight.has(lockKey)) return { error: "in_progress" };
  if (lockKey) dramaInFlight.add(lockKey);

  try {
    if (action === "ignore") {
      if (message?.edit) {
        const doneCard = ComponentsV2Builder.card({
          title: "Drama Watcher · Descartado",
          description: `Caso de <@${targetId}> ignorado por <@${modUser.id}>.`,
          color: GREEN,
        });
        await message.edit(doneCard.toPayload()).catch(() => {});
      }
      return { ok: true, action: "ignore" };
    }

    const requiredPerm =
      action === "ban" ? PermissionFlagsBits.BanMembers :
      action === "kick" ? PermissionFlagsBits.KickMembers :
      PermissionFlagsBits.ModerateMembers;

    if (modMember.id !== guild.ownerId && !modMember.permissions?.has?.(requiredPerm)) {
      return { error: "no_perm" };
    }

    const target = await guild.members.fetch(targetId).catch(() => null);
    if (!target) return { error: "not_found" };
    if (target.id === guild.ownerId || target.id === guild.members.me?.id) return { error: "hierarchy" };
    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    if (!me || target.roles.highest.position >= me.roles.highest.position) return { error: "bot_hierarchy" };
    if (action !== "warn" && !me.permissions?.has?.(requiredPerm)) return { error: "bot_hierarchy" };
    if (action === "ban" && !target.bannable) return { error: "bot_hierarchy" };
    if (action === "kick" && !target.kickable) return { error: "bot_hierarchy" };
    if (action === "mute" && !target.moderatable) return { error: "bot_hierarchy" };

    if (modMember.id !== guild.ownerId && target.roles.highest.position >= modMember.roles.highest.position) {
      return { error: "hierarchy" };
    }

    const modTag = modUser.tag || modUser.username;
    const reason = `Drama Watcher (${modTag})`;

    if (action === "ban") {
      await target.ban({ reason });
      await addModCase({ guildId: guild.id, userId: targetId, moderatorId: modUser.id, type: "ban", reason });
    } else if (action === "kick") {
      await target.kick(reason);
      await addModCase({ guildId: guild.id, userId: targetId, moderatorId: modUser.id, type: "kick", reason });
    } else if (action === "mute") {
      await target.timeout(10 * 60_000, reason);
      await addModCase({ guildId: guild.id, userId: targetId, moderatorId: modUser.id, type: "mute", reason, durationMs: 10 * 60_000 });
    } else if (action === "warn") {
      await addWarn({ guildId: guild.id, userId: targetId, moderatorId: modUser.id, reason });
    }

    await logAction(guild, {
      title: `Drama Watcher · ${action.toUpperCase()}`,
      color: RED,
      fields: [
        { name: "Usuario", value: `${target.user.tag || target.user.username} (\`${targetId}\`)`, inline: true },
        { name: "Moderador", value: modTag, inline: true },
      ],
    }).catch(() => {});

    if (message?.edit) {
      const doneCard = ComponentsV2Builder.card({
        title: `Drama Watcher · Acción: ${action.toUpperCase()}`,
        description: `Ejecutado sobre <@${targetId}> por <@${modUser.id}>.`,
        color: RED,
      });
      await message.edit(doneCard.toPayload()).catch(() => {});
    }
    return { ok: true, action };
  } finally {
    if (lockKey) dramaInFlight.delete(lockKey);
  }
}

async function handleDramaReaction(reaction, user) {
  if (!user || user.bot || !reaction?.message?.guild) return;
  const emoji = reaction.emoji?.name;
  const action = DRAMA_EMOJIS[emoji];
  if (!action) return;

  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const message = reaction.message;
    if (message.partial) await message.fetch().catch(() => {});
    if (message.author?.id !== message.client?.user?.id) return;

    const serialized = JSON.stringify(message.components ?? []);
    const idMatch = serialized.match(/drama:(?:ban|kick|mute|warn|ignore):(\d{17,22})/);
    if (!idMatch) return;

    const dramaChId = await getDramaChannelId(message.guild.id);
    if (dramaChId && dramaChId !== message.channelId) return;

    const modMember = await message.guild.members.fetch(user.id).catch(() => null);
    if (!modMember) return;

    await executeDramaAction({
      guild: message.guild,
      modMember,
      modUser: user,
      targetId: idMatch[1],
      action,
      message,
    });
  } catch (err) {
    log.warn("Error en Drama Watcher reaction", { err: err?.message });
  }
}

function pruneSpamTracker(now) {
  for (const [k, arr] of spamTracker) {
    if (!arr.length || now - arr[arr.length - 1] >= 5000) {
      spamTracker.delete(k);
    }
  }
  while (spamTracker.size > 5000) {
    const oldest = spamTracker.keys().next().value;
    if (oldest !== undefined) spamTracker.delete(oldest);
    else break;
  }
}

async function evaluateMessageAutomod(message) {
  if (!message?.guild?.id || !message.member || message.author?.bot) return false;
  if (message.member.permissions?.has?.(PermissionFlagsBits.ManageMessages) || message.member.id === message.guild.ownerId) {
    return false;
  }
  if (mongoose.connection.readyState !== 1) return false;

  const cfg = await getAutomodConfig(message.guild.id);
  if (!cfg.enabled) return false;
  if (cfg.ignoredChannels?.includes(message.channelId)) return false;
  if (cfg.ignoredRoles?.some((r) => message.member.roles?.cache?.has(r))) return false;

  const text = message.content ?? "";
  let violation = null;

  if (cfg.antiSpam) {
    const k = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const list = (spamTracker.get(k) ?? []).filter((t) => now - t < 5000);
    list.push(now);
    if (spamTracker.size >= 5000 && !spamTracker.has(k)) pruneSpamTracker(now);
    spamTracker.delete(k);
    spamTracker.set(k, list);
    if (list.length >= 6) violation = "Spam rápido detectado";
  }

  if (!violation && cfg.antiInvites && /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-zA-Z0-9-]+/i.test(text)) {
    violation = "Invitación de Discord no permitida";
  }
  if (!violation && cfg.antiLinks && /https?:\/\/[^\s]+/i.test(text)) {
    violation = "Enlace externo no permitido";
  }
  if (!violation && cfg.antiMentions && ((message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0)) >= 5) {
    violation = "Menciones masivas detectadas";
  }
  if (!violation && cfg.antiCaps && text.length >= 14) {
    const letters = text.replace(/\P{L}/gu, "");
    const upper = letters.replace(/\P{Lu}/gu, "");
    if (letters.length >= 10 && upper.length / letters.length >= 0.75) {
      violation = "Exceso de mayúsculas";
    }
  }
  if (!violation && cfg.blockedWords?.length) {
    const lower = text.toLowerCase();
    const hit = cfg.blockedWords.find((w) => w && lower.includes(String(w).toLowerCase()));
    if (hit) violation = `Palabra bloqueada (${hit})`;
  }

  if (!violation) return false;

  await message.delete().catch(() => {});

  if (cfg.customMessage) {
    const vars = buildTagVariables({ user: message.author, member: message.member, guild: message.guild, channel: message.channel }, { reason: violation });
    const notice = substituteVars(cfg.customMessage, vars);
    await message.channel.send({ content: notice, allowedMentions: { users: [message.author.id] } })
      .then((m) => setTimeout(() => m.delete().catch(() => {}), 7000).unref())
      .catch(() => {});
  }

  const botId = message.client?.user?.id ?? "redbot";
  if (cfg.action === "warn") {
    await addWarn({ guildId: message.guild.id, userId: message.author.id, moderatorId: botId, reason: `AutoMod: ${violation}` }).catch(() => {});
  } else if (cfg.action === "mute" && message.member.moderatable) {
    const muted = await message.member.timeout(cfg.muteMs || 300_000, `AutoMod: ${violation}`).then(() => true).catch(() => false);
    if (muted) {
      await addModCase({ guildId: message.guild.id, userId: message.author.id, moderatorId: botId, type: "mute", reason: `AutoMod: ${violation}`, durationMs: cfg.muteMs || 300_000 }).catch(() => {});
    }
  } else if (cfg.action === "kick" && message.member.kickable) {
    const kicked = await message.member.kick(`AutoMod: ${violation}`).then(() => true).catch(() => false);
    if (kicked) {
      await addModCase({ guildId: message.guild.id, userId: message.author.id, moderatorId: botId, type: "kick", reason: `AutoMod: ${violation}` }).catch(() => {});
    }
  }

  await postToDramaWatcher({
    guild: message.guild,
    targetUser: message.author,
    channelId: message.channelId,
    reason: violation,
    ruleName: `AutoMod (${cfg.action})`,
    excerpt: text.slice(0, 400),
  }).catch(() => {});

  return true;
}

module.exports = {
  getAutomodConfig,
  updateAutomodConfig,
  invalidateDramaChannelCache,
  postToDramaWatcher,
  executeDramaAction,
  handleDramaReaction,
  evaluateMessageAutomod,
};
