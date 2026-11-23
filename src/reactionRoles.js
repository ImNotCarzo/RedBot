const { ComponentsV2Builder, V2Text } = require("gralonium");
const { RED } = require("./config");
const { ReactionRolePanel, TempRole } = require("./database");
const { logAction } = require("./guild");
const { Logger } = require("./runtime");
const { canBotManageRole, clearTimerMap, fetchBotMember, isDbReady, scheduleLongTimeout } = require("./shared/utils");

const log = new Logger("REACTION_ROLES");
const MAX_PANELS_PER_GUILD = 40;
const MAX_ROLES_PER_GUILD = 1000;
const tempRoleTimers = new Map();

function tempRoleKey(guildId, userId, roleId) {
  return `${guildId}:${userId}:${roleId}`;
}

function scheduleTempRoleExpiry(client, guildId, userId, roleId, expiresAt) {
  const key = tempRoleKey(guildId, userId, roleId);
  clearTimerMap(tempRoleTimers, key);

  const targetMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(targetMs)) return;

  scheduleLongTimeout(tempRoleTimers, key, targetMs, async () => {
    try {
      if (isDbReady()) {
        const doc = await TempRole.findOne({ guildId, userId, roleId }).lean().catch(() => null);
        if (!doc) return;
        const docMs = new Date(doc.expiresAt).getTime();
        if (Number.isFinite(docMs) && docMs > Date.now() + 2000) {
          scheduleTempRoleExpiry(client, guildId, userId, roleId, doc.expiresAt);
          return;
        }
      }

      const guild = client.guilds?.cache?.get(guildId) ?? await client.guilds?.fetch?.(guildId).catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member?.roles?.cache?.has(roleId)) {
          await member.roles.remove(roleId, "Rol temporal expirado").catch(() => {});
        }
      }

      if (isDbReady()) {
        await TempRole.deleteOne({ guildId, userId, roleId }).catch(() => {});
      }
    } catch {}
  });
}

async function grantTempRole({ client, guild, member, role, durationMs, source = "manual" }) {
  const expiresAt = new Date(Date.now() + durationMs);
  await member.roles.add(role, `Rol temporal (${source})`);
  if (isDbReady()) {
    await TempRole.findOneAndUpdate(
      { guildId: guild.id, userId: member.id, roleId: role.id },
      { $set: { expiresAt, source } },
      { upsert: true, returnDocument: "after" }
    ).catch(() => {});
  }
  scheduleTempRoleExpiry(client, guild.id, member.id, role.id, expiresAt);
  return expiresAt;
}

async function restoreTempRoles(client) {
  if (!isDbReady()) return;
  const rows = await TempRole.find().lean().catch(() => []);
  for (const r of rows) {
    scheduleTempRoleExpiry(client, r.guildId, r.userId, r.roleId, r.expiresAt);
  }
}

function stopTempRoleTimers() {
  clearTimerMap(tempRoleTimers);
}

function buildReactionRolePanelPayload(panel) {
  const builder = new ComponentsV2Builder({ color: RED })
    .addText(`${V2Text.heading(panel.title || "Roles", 3, 200)}${panel.description ? `\n${panel.description}` : ""}`);

  if (panel.entries?.length) {
    builder.addSeparator("small");
    const lines = panel.entries.map((e) => `${e.emoji || "•"} **${e.label || `<@&${e.roleId}>`}** → <@&${e.roleId}>`);
    builder.addText(lines.join("\n"));

    for (let i = 0; i < panel.entries.length; i += 5) {
      const chunk = panel.entries.slice(i, i + 5);
      builder.addSpacer("small").addButtonsRow(
        chunk.map((entry) => ({
          customId: `rr:${panel.panelId}:${entry.key}`,
          ...(entry.emoji ? { emoji: entry.emoji } : {}),
          label: String(entry.label || "Rol").slice(0, 80),
          style: "secondary",
        }))
      );
    }
  }

  return builder.toPayload();
}

function normalizeEmojiKey(emoji) {
  if (!emoji) return "";
  if (typeof emoji === "string") return emoji.trim();
  if (emoji.id) return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
  return emoji.name ?? "";
}

async function applyPanelRoleAction({ client, guild, member, panel, entry, isAddIntent = null }) {
  const me = await fetchBotMember(guild);
  const role = guild.roles.cache.get(entry.roleId);
  if (!canBotManageRole(me, role)) {
    return { error: "hierarchy" };
  }

  const hasRole = member.roles.cache.has(role.id);
  const shouldAdd = isAddIntent !== null ? isAddIntent : !hasRole;

  if (panel.mode === "verify" && !shouldAdd) {
    return { unchanged: true, action: "verify" };
  }

  if (shouldAdd) {
    if (panel.mode === "unique") {
      for (const sibling of panel.entries) {
        if (sibling.roleId !== role.id && member.roles.cache.has(sibling.roleId)) {
          const sibRole = guild.roles.cache.get(sibling.roleId);
          if (sibRole && sibRole.position < me.roles.highest.position) {
            await member.roles.remove(sibRole, "Reaction Role (modo único)").catch(() => {});
          }
        }
      }
    }

    if (panel.mode === "temp" && panel.durationMs > 0) {
      const expiresAt = await grantTempRole({
        client,
        guild,
        member,
        role,
        durationMs: panel.durationMs,
        source: `reaction:${panel.panelId}`,
      });
      return { action: "added_temp", role, expiresAt };
    }

    if (!hasRole) {
      await member.roles.add(role, `Reaction Role (${panel.panelId})`);
    }
    return { action: "added", role };
  }

  if (hasRole) {
    await member.roles.remove(role, `Reaction Role (${panel.panelId})`);
  }
  if (panel.mode === "temp") {
    const key = tempRoleKey(guild.id, member.id, role.id);
    clearTimerMap(tempRoleTimers, key);
    if (isDbReady()) {
      await TempRole.deleteOne({ guildId: guild.id, userId: member.id, roleId: role.id }).catch(() => {});
    }
  }
  return { action: "removed", role };
}

async function handleEmojiReactionRole(bot, reaction, user, isAdding) {
  if (!user || user.bot || !reaction?.message?.guildId) return;
  if (!isDbReady()) return;

  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const message = reaction.message;
    if (message?.partial) await message.fetch().catch(() => {});
    const panel = await ReactionRolePanel.findOne({ messageId: message.id }).lean().catch(() => null);
    if (!panel?.entries?.length) return;

    const emojiStr = normalizeEmojiKey(reaction.emoji);
    const entry = panel.entries.find(
      (e) => e.emoji && (e.emoji === emojiStr || e.emoji === reaction.emoji?.name || e.emoji === reaction.emoji?.id)
    );
    if (!entry) return;

    const guild = message.guild ?? bot?.guilds?.cache?.get?.(message.guildId);
    if (!guild) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const res = await applyPanelRoleAction({
      client: bot ?? guild.client,
      guild,
      member,
      panel,
      entry,
      isAddIntent: isAdding,
    });
    if (res.action === "added_temp" || res.action === "added") {
      await logAction(guild, {
        title: "Rol por reacción asignado",
        fields: [
          { name: "Usuario", value: `${user.tag || user.username} (\`${user.id}\`)`, inline: true },
          { name: "Rol", value: `<@&${entry.roleId}>`, inline: true },
        ],
      }).catch(() => {});
    }
  } catch (err) {
    log.warn("Error procesando reaction role", { err: err?.message });
  }
}

module.exports = {
  MAX_PANELS_PER_GUILD,
  MAX_ROLES_PER_GUILD,
  grantTempRole,
  restoreTempRoles,
  stopTempRoleTimers,
  buildReactionRolePanelPayload,
  applyPanelRoleAction,
  handleEmojiReactionRole,
};
