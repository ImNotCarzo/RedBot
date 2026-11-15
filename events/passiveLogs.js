const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const { GREEN, RED, YELLOW } = require("../src/config");
const { getLang, logAction } = require("../src/guild");
const { t } = require("../src/i18n");

const AUDIT_WINDOW_MS = 5000;

async function checkRecentAudit(guild, auditType, targetId) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog)) {
    return { skip: false, entry: null };
  }

  const fetched = await guild.fetchAuditLogs({ type: auditType, limit: 5 }).catch(() => null);
  const now = Date.now();
  const entry = fetched?.entries?.find(
    (e) =>
      String(e?.targetId ?? e?.target?.id ?? "") === String(targetId) &&
      now - (e.createdTimestamp ?? 0) < AUDIT_WINDOW_MS
  ) ?? null;

  const botId = guild.client?.user?.id;
  if (entry && botId && entry.executorId === botId) {
    return { skip: true, entry };
  }

  return { skip: false, entry };
}

function formatExecutor(entry, lang) {
  if (!entry?.executor) return t(lang, "passive.unknown");
  return `${entry.executor.tag || entry.executor.username} (\`${entry.executor.id}\`)`;
}

const data = [
  {
    name: "guildBanAdd",
    once: false,
    async code(_bot, ban) {
      const guild = ban?.guild;
      const user = ban?.user;
      if (!guild?.id || !user?.id) return;

      const { skip, entry } = await checkRecentAudit(guild, AuditLogEvent.MemberBanAdd, user.id);
      if (skip) return;

      const lang = await getLang(guild.id);
      const reason = entry?.reason || ban.reason || t(lang, "passive.no_reason");
      await logAction(guild, {
        title: t(lang, "passive.ban_add"),
        color: RED,
        fields: [
          { name: t(lang, "passive.target"), value: `${user.tag || user.username} (\`${user.id}\`)`, inline: true },
          { name: t(lang, "passive.executor"), value: formatExecutor(entry, lang), inline: true },
          { name: t(lang, "passive.reason"), value: reason.slice(0, 300), inline: false },
        ],
      });
    },
  },
  {
    name: "guildBanRemove",
    once: false,
    async code(_bot, ban) {
      const guild = ban?.guild;
      const user = ban?.user;
      if (!guild?.id || !user?.id) return;

      const { skip, entry } = await checkRecentAudit(guild, AuditLogEvent.MemberBanRemove, user.id);
      if (skip) return;

      const lang = await getLang(guild.id);
      await logAction(guild, {
        title: t(lang, "passive.ban_remove"),
        color: GREEN,
        fields: [
          { name: t(lang, "passive.target"), value: `${user.tag || user.username} (\`${user.id}\`)`, inline: true },
          { name: t(lang, "passive.executor"), value: formatExecutor(entry, lang), inline: true },
        ],
      });
    },
  },
  {
    name: "guildMemberRemove",
    once: false,
    async code(_bot, member) {
      const guild = member?.guild;
      const user = member?.user;
      if (!guild?.id || !user?.id) return;

      const banCheck = await checkRecentAudit(guild, AuditLogEvent.MemberBanAdd, user.id);
      if (banCheck.entry) return;

      const { skip, entry } = await checkRecentAudit(guild, AuditLogEvent.MemberKick, user.id);
      if (skip) return;

      const lang = await getLang(guild.id);
      const fields = [
        { name: t(lang, "passive.target"), value: `${user.tag || user.username} (\`${user.id}\`)`, inline: true },
      ];
      if (entry) {
        fields.push({ name: t(lang, "passive.executor"), value: formatExecutor(entry, lang), inline: true });
        if (entry.reason) {
          fields.push({ name: t(lang, "passive.reason"), value: entry.reason.slice(0, 300), inline: false });
        }
      }

      await logAction(guild, {
        title: t(lang, "passive.member_leave"),
        color: YELLOW,
        fields,
      });
    },
  },
  {
    name: "channelDelete",
    once: false,
    async code(_bot, channel) {
      const guild = channel?.guild;
      if (!guild?.id || !channel?.id) return;

      const { skip, entry } = await checkRecentAudit(guild, AuditLogEvent.ChannelDelete, channel.id);
      if (skip) return;

      const lang = await getLang(guild.id);
      await logAction(guild, {
        title: t(lang, "passive.channel_delete"),
        color: RED,
        fields: [
          { name: t(lang, "passive.target"), value: `#${channel.name || "unknown"} (\`${channel.id}\`)`, inline: true },
          { name: t(lang, "passive.executor"), value: formatExecutor(entry, lang), inline: true },
        ],
      });
    },
  },
  {
    name: "roleDelete",
    once: false,
    async code(_bot, role) {
      const guild = role?.guild;
      if (!guild?.id || !role?.id) return;

      const { skip, entry } = await checkRecentAudit(guild, AuditLogEvent.RoleDelete, role.id);
      if (skip) return;

      const lang = await getLang(guild.id);
      await logAction(guild, {
        title: t(lang, "passive.role_delete"),
        color: RED,
        fields: [
          { name: t(lang, "passive.target"), value: `${role.name || "unknown"} (\`${role.id}\`)`, inline: true },
          { name: t(lang, "passive.executor"), value: formatExecutor(entry, lang), inline: true },
        ],
      });
    },
  },
];

module.exports = { data, checkRecentAudit };
