const { PermissionFlagsBits } = require("discord.js");
const { AutoRule, AutoTimer, CustomCommand } = require("./database");
const { TtlCache } = require("./guild");
const { Logger } = require("./runtime");
const { canBotManageRole, fetchBotMember, isDbReady, isSafeRegexPattern } = require("./shared/utils");
const { resolveEmbedTemplate, runTagScript, substituteVars, buildTagVariables } = require("./tagscript");

const log = new Logger("AUTOMATION");
const MAX_CUSTOM_COMMANDS = 500;
const MAX_EMBED_TEMPLATES = 500;
const MAX_TIMERS = 100;
const MAX_RULES = 50;

const customCommandsCache = new TtlCache(2 * 60_000, 2000);
const autoRulesCache = new TtlCache(2 * 60_000, 4000);
const compiledRegexCache = new Map();
const MAX_REGEX_CACHE = 500;
const SNOWFLAKE_RE = /^\d{17,22}$/;

let timerInterval = null;
let isRunningTimers = false;

function getCompiledRegex(pattern) {
  if (compiledRegexCache.has(pattern)) return compiledRegexCache.get(pattern);
  if (!isSafeRegexPattern(pattern)) {
    compiledRegexCache.set(pattern, null);
    return null;
  }
  const re = new RegExp(pattern, "i");
  if (compiledRegexCache.size >= MAX_REGEX_CACHE) {
    const oldest = compiledRegexCache.keys().next().value;
    if (oldest !== undefined) compiledRegexCache.delete(oldest);
  }
  compiledRegexCache.set(pattern, re);
  return re;
}

function invalidateCustomCommandsCache(guildId) {
  if (guildId) customCommandsCache.delete(guildId);
}

function invalidateAutoRulesCache(guildId) {
  if (!guildId) return;
  for (const ev of ["message", "member_join", "voice_join"]) {
    autoRulesCache.delete(`${guildId}:${ev}`);
  }
}

async function getGuildCustomCommands(guildId) {
  const cached = customCommandsCache.get(guildId);
  if (cached !== undefined) return cached;
  const list = await CustomCommand.find({ guildId }).lean().catch(() => []);
  customCommandsCache.set(guildId, list);
  return list;
}

async function getGuildAutoRules(guildId, event) {
  const key = `${guildId}:${event}`;
  const cached = autoRulesCache.get(key);
  if (cached !== undefined) return cached;
  const rules = await AutoRule.find({ guildId, event, enabled: true }).lean().catch(() => []);
  autoRulesCache.set(key, rules);
  return rules;
}

async function executeTagActions({ message = null, member = null, guild, channel = null, actions, grantRoleAllowed = false }) {
  if (!actions || !guild) return;

  if (!actions.deleteTrigger && actions.reactions?.length && message?.react) {
    for (const r of actions.reactions) {
      await message.react(r).catch(() => {});
    }
  }
  if (actions.deleteTrigger && message?.deletable) {
    await message.delete().catch(() => {});
  }
  if (actions.dm && (member?.user || message?.author)) {
    const targetUser = member?.user ?? message.author;
    await targetUser.send({ content: actions.dm }).catch(() => {});
  }

  const targetMember = member ?? message?.member;
  if (grantRoleAllowed && targetMember && (actions.addRoles?.length || actions.removeRoles?.length)) {
    const me = await fetchBotMember(guild);
    if (me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
      for (const rid of actions.addRoles) {
        const role = guild.roles.cache.get(rid);
        if (canBotManageRole(me, role) && !targetMember.roles.cache.has(rid)) {
          await targetMember.roles.add(role, "Custom Command TagScript").catch(() => {});
        }
      }
      for (const rid of actions.removeRoles) {
        const role = guild.roles.cache.get(rid);
        if (canBotManageRole(me, role) && targetMember.roles.cache.has(rid)) {
          await targetMember.roles.remove(role, "Custom Command TagScript").catch(() => {});
        }
      }
    }
  }

  if (actions.embedNames?.length && channel?.isTextBased?.()) {
    const embeds = [];
    for (const name of actions.embedNames.slice(0, 3)) {
      const emb = await resolveEmbedTemplate(guild.id, name, {
        user: targetMember?.user ?? message?.author,
        member: targetMember,
        guild,
        channel,
      });
      if (emb) embeds.push(emb);
    }
    if (embeds.length) {
      await channel.send({ embeds, allowedMentions: { parse: [] } }).catch(() => {});
    }
  }
}

async function handleCustomCommandsOnMessage(message, prefix = ".") {
  if (!message?.guild?.id || message.author?.bot || !message.content) return false;
  if (!isDbReady()) return false;

  const list = await getGuildCustomCommands(message.guild.id);
  if (!list.length) return false;

  const content = message.content.trim();
  const lower = content.toLowerCase();
  const withoutPrefix = content.startsWith(prefix) ? content.slice(prefix.length).trim() : null;
  const cmdName = withoutPrefix ? withoutPrefix.split(/\s+/)[0].toLowerCase() : null;
  const args = withoutPrefix ? withoutPrefix.split(/\s+/).slice(1) : content.split(/\s+/).slice(1);

  let matched = null;
  for (const cmd of list) {
    const trig = String(cmd.trigger || "").toLowerCase();
    if (cmd.matchType === "exact" && cmdName && cmdName === trig) { matched = cmd; break; }
    if (cmd.matchType === "startswith" && lower.startsWith(trig)) { matched = cmd; break; }
    if (cmd.matchType === "contains" && lower.includes(trig)) { matched = cmd; break; }
    if (cmd.matchType === "regex") {
      const re = getCompiledRegex(cmd.trigger);
      if (re && re.test(content.slice(0, 500))) { matched = cmd; break; }
    }
  }

  if (!matched) return false;

  const ctxObj = { user: message.author, member: message.member, guild: message.guild, channel: message.channel, args };
  const result = runTagScript(matched.response || "", ctxObj);

  const embeds = [];
  if (matched.templateName) {
    const emb = await resolveEmbedTemplate(message.guild.id, matched.templateName, ctxObj);
    if (emb) embeds.push(emb);
  }

  if (result.text || embeds.length) {
    await message.channel.send({
      ...(result.text ? { content: result.text } : {}),
      ...(embeds.length ? { embeds } : {}),
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }

  await executeTagActions({
    message,
    member: message.member,
    guild: message.guild,
    channel: message.channel,
    actions: result.actions,
    grantRoleAllowed: Boolean(matched.grantRoleAllowed),
  });
  return true;
}

function matchesRuleCondition(rule, { message = null, member = null, channel = null }) {
  const type = rule.conditionType;
  const val = String(rule.conditionValue || "");
  if (type === "always") return true;
  if (type === "contains" && message) return (message.content || "").toLowerCase().includes(val.toLowerCase());
  if (type === "has_role" && member) return member.roles?.cache?.has(val);
  if (type === "is_bot" && member) return Boolean(member.user?.bot);
  if (type === "not_bot" && member) return !member.user?.bot;
  if (type === "in_channel" && channel) return channel.id === val;
  if (type === "account_age_lt_days" && member?.user?.createdTimestamp) {
    const days = Number(val) || 7;
    return Date.now() - member.user.createdTimestamp < days * 86_400_000;
  }
  return false;
}

async function dispatchAutoRules(event, { guild, message = null, member = null, channel = null } = {}) {
  if (!guild?.id || !isDbReady()) return;
  const rules = await getGuildAutoRules(guild.id, event);
  if (!rules.length) return;

  for (const rule of rules) {
    try {
      if (!matchesRuleCondition(rule, { message, member, channel })) continue;

      const targetMember = member ?? message?.member;
      const vars = buildTagVariables({ user: targetMember?.user ?? message?.author, member: targetMember, guild, channel });
      const actionVal = substituteVars(rule.actionValue || "", vars);

      if (rule.actionType === "send_channel") {
        const pipeIdx = actionVal.indexOf("|");
        const firstPart = pipeIdx >= 0 ? actionVal.slice(0, pipeIdx).trim() : "";
        let targetCh = channel;
        let msgText = actionVal;
        if (pipeIdx >= 0 && SNOWFLAKE_RE.test(firstPart)) {
          targetCh = guild.channels.cache.get(firstPart) ?? null;
          msgText = actionVal.slice(pipeIdx + 1).trim();
        }
        if (targetCh?.isTextBased?.() && msgText) {
          await targetCh.send({ content: msgText, allowedMentions: { parse: [] } }).catch(() => {});
        }
      } else if (rule.actionType === "send_dm" && targetMember?.user) {
        if (actionVal) await targetMember.user.send({ content: actionVal }).catch(() => {});
      } else if (rule.actionType === "add_role" && targetMember) {
        const me = await fetchBotMember(guild);
        const role = guild.roles.cache.get(actionVal.trim());
        if (canBotManageRole(me, role)) {
          await targetMember.roles.add(role, `AutoRule: ${rule.name}`).catch(() => {});
        }
      } else if (rule.actionType === "remove_role" && targetMember) {
        const me = await fetchBotMember(guild);
        const role = guild.roles.cache.get(actionVal.trim());
        if (canBotManageRole(me, role)) {
          await targetMember.roles.remove(role, `AutoRule: ${rule.name}`).catch(() => {});
        }
      } else if (rule.actionType === "delete_message" && message?.deletable) {
        await message.delete().catch(() => {});
      }
    } catch (err) {
      log.warn("Error ejecutando AutoRule", { rule: rule.name, err: err?.message });
    }
  }
}

async function runAutoTimersTick(client) {
  if (isRunningTimers || !client?.channels || !isDbReady()) return;
  isRunningTimers = true;
  try {
    const now = new Date();
    const due = await AutoTimer.find({ enabled: true, nextRunAt: { $lte: now } }).limit(25).lean().catch(() => []);
    if (!due.length) return;

    for (const timer of due) {
      try {
        const intervalMs = Math.max(60_000, Number(timer.intervalMs) || 60_000);
        const nextAt = new Date(Date.now() + intervalMs);
        const claimed = await AutoTimer.findOneAndUpdate(
          { _id: timer._id, enabled: true, nextRunAt: { $lte: now } },
          { $set: { nextRunAt: nextAt } }
        ).lean().catch(() => null);
        if (!claimed) continue;

        const ch = client.channels.cache.get(timer.channelId) ?? await client.channels.fetch(timer.channelId).catch(() => null);
        if (!ch?.isTextBased?.()) continue;

        const guild = ch.guild;
        const embeds = [];
        if (timer.templateName && guild) {
          const emb = await resolveEmbedTemplate(guild.id, timer.templateName, { guild, channel: ch });
          if (emb) embeds.push(emb);
        }
        const vars = buildTagVariables({ guild, channel: ch });
        const text = timer.message ? substituteVars(timer.message, vars) : "";
        if (text || embeds.length) {
          await ch.send({ ...(text ? { content: text } : {}), ...(embeds.length ? { embeds } : {}), allowedMentions: { parse: [] } }).catch(() => {});
        }
      } catch {}
    }
  } finally {
    isRunningTimers = false;
  }
}

function startAutomationWorkers(client) {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    runAutoTimersTick(client).catch(() => {});
  }, 30_000);
  timerInterval.unref();
}

function stopAutomationWorkers() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

module.exports = {
  MAX_CUSTOM_COMMANDS,
  MAX_EMBED_TEMPLATES,
  MAX_TIMERS,
  MAX_RULES,
  isSafeRegexPattern,
  invalidateCustomCommandsCache,
  invalidateAutoRulesCache,
  handleCustomCommandsOnMessage,
  dispatchAutoRules,
  startAutomationWorkers,
  stopAutomationWorkers,
};
