const { Errors } = require("gralonium");
const { resolveContextLang } = require("../src/guild");
const { t } = require("../src/i18n");
const { Logger, sanitizeError } = require("../src/runtime");

const log = new Logger("EVENT_FRAMEWORK_ERROR", process.env.LOG_LEVEL);

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

    const safeSend = async (payload) => {
      const normalized =
        payload && typeof payload === "object" && typeof payload.toPayload === "function"
          ? payload.toPayload()
          : payload;
      try {
        if (typeof ctx?.send === "function") {
          return await ctx.send(normalized);
        }

        const data = typeof normalized === "string" ? { content: normalized } : normalized;
        if (ctx?.channel?.send) {
          return await ctx.channel.send(data);
        }
      } catch {
        try {
          if (ctx?.interaction?.replied && typeof ctx?.ephemeral === "function") {
            return await ctx.ephemeral(normalized, { followUp: true });
          }
          if (ctx?.channel?.send) {
            const text = typeof normalized === "string" ? normalized : normalized?.content || "";
            if (text) return await ctx.channel.send(text);
          }
        } catch {}
      }
    };

    const requiredFallback = lang === "en" ? "the required ones" : "los requeridos";

    if (is(err, Errors.GuildOnly)) {
      return safeSend(t(lang, "error.guild_only"));
    }

    if (is(err, Errors.CommandNotFound)) return;

    if (is(err, Errors.NotOwner)) {
      return safeSend(t(lang, "error.not_owner"));
    }

    if (is(err, Errors.MissingPermission)) {
      const permisos = err.permissions?.join(", ") || requiredFallback;
      return safeSend(t(lang, "error.missing_perm", { perms: permisos }));
    }

    if (
      is(err, Errors.MissingBotPermission) ||
      is(err, Errors.MissingBotChannelPermission) ||
      isDiscordPermError(err)
    ) {
      const missing = resolveMissingBotPermissions(ctx, err, _client);
      const permisos = missing.length ? missing.join(", ") : requiredFallback;
      return safeSend(t(lang, "error.missing_bot_perm", { perms: permisos }));
    }

    if (is(err, Errors.MissingChannelPermission)) {
      const permisos = err.permissions?.join(", ") || requiredFallback;
      return safeSend(t(lang, "error.missing_channel_perm", { perms: permisos }));
    }

    if (
      is(err, Errors.OnlyForIDs) ||
      is(err, Errors.RestrictedUser) ||
      is(err, Errors.RestrictedGuild)
    ) {
      return safeSend(t(lang, "error.only_ids"));
    }

    if (is(err, Errors.CommandInCooldown)) {
      const secs = Math.max(1, Math.ceil((err.timeLeft ?? 1000) / 1000));
      return safeSend(t(lang, "error.cooldown", { secs }));
    }

    if (is(err, Errors.MissingRequiredParam)) {
      if (!err.ctx) return;
      const paramName = err.param?.name ?? (lang === "en" ? "required" : "requerido");
      return safeSend(t(lang, "error.missing_param", { param: paramName }));
    }

    if (is(err, Errors.NotNSFW)) {
      return safeSend(t(lang, "error.not_nsfw"));
    }

    if (is(err, Errors.NotInChannelType)) {
      return safeSend(t(lang, "error.wrong_channel_type"));
    }

    if (is(err, Errors.InvalidParamMember)) {
      return safeSend(t(lang, "error.invalid_member"));
    }

    if (is(err, Errors.InvalidParamChannel)) {
      return safeSend(t(lang, "error.invalid_channel"));
    }

    if (is(err, Errors.InvalidParamRole)) {
      return safeSend(t(lang, "error.invalid_role"));
    }

    if (
      is(err, Errors.InvalidParam) ||
      is(err, Errors.InvalidParamBoolean) ||
      is(err, Errors.InvalidParamNumber) ||
      is(err, Errors.InvalidParamChoice) ||
      is(err, Errors.InvalidParamAttachment) ||
      is(err, Errors.InvalidChannelType)
    ) {
      const detail = err.message ?? (lang === "en" ? "invalid value" : "valor incorrecto");
      return safeSend(t(lang, "error.invalid_param", { detail }));
    }

    if (is(err, Errors.UnknownCommandError)) {
      return safeSend(t(lang, "error.unknown_command"));
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
