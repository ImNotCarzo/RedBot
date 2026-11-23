const { Errors } = require("gralonium");
const { resolveContextLang } = require("../src/guild");
const { t } = require("../src/i18n");
const { Logger, sanitizeError } = require("../src/runtime");

const log = new Logger("EVENT_FRAMEWORK_ERROR");

function is(err, Type) {
  try {
    return Type && err instanceof Type;
  } catch {
    return false;
  }
}

function isDiscordPermError(err) {
  return (
    err?.code === 50013 ||
    err?.code === 50006 ||
    (typeof err?.message === "string" && (
      err.message.includes("Missing Permissions") ||
      err.message.includes("Cannot send an empty message")
    ))
  );
}

function resolveMissingBotPermissions(ctx, err, client) {
  const missing = [];
  if (err?.permissions && Array.isArray(err.permissions)) {
    missing.push(...err.permissions);
  }

  if (ctx?.guild) {
    const me = ctx.guild.members?.me ?? (client?.user?.id ? ctx.guild.members.cache.get(client.user.id) : null);
    const channel = ctx.channel;
    const channelPerms = channel?.permissionsFor ? channel.permissionsFor(me || client?.user) : null;
    if (channelPerms) {
      if (!channelPerms.has("EmbedLinks")) missing.push("EmbedLinks");
      if (!channelPerms.has("SendMessages")) missing.push("SendMessages");
      if (!channelPerms.has("ViewChannel")) missing.push("ViewChannel");
    } else if (me?.permissions) {
      if (!me.permissions.has("EmbedLinks")) missing.push("EmbedLinks");
      if (!me.permissions.has("SendMessages")) missing.push("SendMessages");
    }
  }

  if (!missing.length && isDiscordPermError(err)) {
    missing.push("EmbedLinks");
  }

  return [...new Set(missing)];
}

const ERROR_RULES = [
  { types: [Errors.GuildOnly], key: "error.guild_only" },
  { types: [Errors.CommandNotFound], silent: true },
  { types: [Errors.NotOwner], key: "error.not_owner" },
  {
    types: [Errors.MissingPermission],
    key: "error.missing_perm",
    vars: ({ err, requiredFallback }) => ({ perms: err.permissions?.join(", ") || requiredFallback }),
  },
  {
    match: (err) =>
      is(err, Errors.MissingBotPermission) ||
      is(err, Errors.MissingBotChannelPermission) ||
      isDiscordPermError(err),
    key: "error.missing_bot_perm",
    vars: ({ ctx, err, client, requiredFallback }) => {
      const missing = resolveMissingBotPermissions(ctx, err, client);
      return { perms: missing.length ? missing.join(", ") : requiredFallback };
    },
  },
  {
    types: [Errors.MissingChannelPermission],
    key: "error.missing_channel_perm",
    vars: ({ err, requiredFallback }) => ({ perms: err.permissions?.join(", ") || requiredFallback }),
  },
  { types: [Errors.OnlyForIDs, Errors.RestrictedUser, Errors.RestrictedGuild], key: "error.only_ids" },
  {
    types: [Errors.CommandInCooldown],
    key: "error.cooldown",
    vars: ({ err }) => ({ secs: Math.max(1, Math.ceil((err.timeLeft ?? 1000) / 1000)) }),
  },
  {
    types: [Errors.MissingRequiredParam],
    silent: (err) => !err.ctx,
    key: "error.missing_param",
    vars: ({ err, lang }) => ({ param: err.param?.name ?? (lang === "en" ? "required" : "requerido") }),
  },
  { types: [Errors.NotNSFW], key: "error.not_nsfw" },
  { types: [Errors.NotInChannelType], key: "error.wrong_channel_type" },
  { types: [Errors.InvalidParamMember], key: "error.invalid_member" },
  { types: [Errors.InvalidParamChannel], key: "error.invalid_channel" },
  { types: [Errors.InvalidParamRole], key: "error.invalid_role" },
  {
    types: [
      Errors.InvalidParam,
      Errors.InvalidParamBoolean,
      Errors.InvalidParamNumber,
      Errors.InvalidParamChoice,
      Errors.InvalidParamAttachment,
      Errors.InvalidChannelType,
    ],
    key: "error.invalid_param",
    vars: ({ err, lang }) => ({ detail: err.message ?? (lang === "en" ? "invalid value" : "valor incorrecto") }),
  },
  { types: [Errors.UnknownCommandError], key: "error.unknown_command" },
];

const event = {
  name: "frameworkError",
  once: false,
  async code(_client, err, emittedCtx) {
    const ctx = err?.ctx ?? emittedCtx ?? null;
    if (err && typeof err === "object" && !err.ctx && ctx) err.ctx = ctx;

    const guildId = ctx?.guild?.id ?? ctx?.data?.guildId ?? null;
    const userId = ctx?.user?.id ?? null;
    const commandName = ctx?.command?.data?.name;
    const lang = await resolveContextLang({
      guildId,
      userId,
      locale: ctx?.interaction?.locale ?? ctx?.interaction?.guildLocale,
    }).catch(() => "es");

    const safeSend = async (text) => {
      try {
        if (typeof ctx?.send === "function") {
          return await ctx.send(text);
        }
        if (ctx?.channel?.send) {
          return await ctx.channel.send({ content: text });
        }
      } catch {
        try {
          if (ctx?.interaction?.replied && typeof ctx?.ephemeral === "function") {
            return await ctx.ephemeral(text, { followUp: true });
          }
          if (ctx?.channel?.send && text) {
            return await ctx.channel.send(text);
          }
        } catch {}
      }
    };

    const requiredFallback = lang === "en" ? "the required ones" : "los requeridos";

    for (const rule of ERROR_RULES) {
      const matched = rule.match ? rule.match(err) : rule.types.some((T) => is(err, T));
      if (!matched) continue;
      if (typeof rule.silent === "function" ? rule.silent(err) : rule.silent) return;
      const vars = rule.vars ? rule.vars({ ctx, err, client: _client, lang, requiredFallback }) : undefined;
      return safeSend(t(lang, rule.key, vars));
    }

    log.error("FrameworkError no categorizado", {
      event: "frameworkError",
      guildId,
      userId,
      commandName,
      err: sanitizeError(err),
    });
    return safeSend(t(lang, "error.internal"));
  },
};

module.exports = { data: event };
