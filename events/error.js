const { Errors, ComponentsV2Builder } = require("gralonium");
const { RED } = require("../src/config");
const { getLang } = require("../src/guild");
const { detectLocaleLang, t } = require("../src/i18n");
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

    const guildId = ctx?.guild?.id ?? ctx?.data?.guildId;
    const userId = ctx?.user?.id;
    const commandName = ctx?.command?.data?.name;
    const lang = guildId
      ? await getLang(guildId)
      : detectLocaleLang(ctx?.interaction?.locale ?? ctx?.interaction?.guildLocale);

    const safeSend = async (payload) => {
      try {
        if (typeof ctx?.send === "function") {
          return await ctx.send(payload);
        }

        const data = typeof payload === "string" ? { content: payload } : payload;
        if (ctx?.channel?.send) {
          return await ctx.channel.send(data);
        }
      } catch {
        try {
          if (ctx?.interaction?.replied && typeof ctx?.ephemeral === "function") {
            return await ctx.ephemeral(payload, { followUp: true });
          }
          if (ctx?.channel?.send) {
            const text = typeof payload === "string" ? payload : payload?.content || "";
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

    if (is(err, Errors.OnlyForIDs)) {
      return safeSend(t(lang, "error.only_ids"));
    }

    if (is(err, Errors.CommandInCooldown)) {
      const secs = Math.max(1, Math.ceil((err.timeLeft ?? 1000) / 1000));
      return safeSend(t(lang, "error.cooldown", { secs }));
    }

    if (is(err, Errors.MissingRequiredParam)) {
      if (!err.ctx) return;
      const bot = err.ctx?.bot?.user ?? _client?.user;

      if (commandName === "ask" || err.param?.name === "pregunta") {
        const isEn = lang === "en";
        const askTitle = isEn ? "Ask Command" : "Comando Ask";
        const askDesc = isEn
          ? "**Usage:**\nAsk the AI a question\n\n**Aliases:**\n`ia`, `ai`\n\n```js\n.ask <question>\nExample: .ask why is the sky blue\n```"
          : "**Usos:**\nHazle una pregunta a la IA\n\n**Aliases:**\n`ia`, `ai`\n\n```js\n.ask <pregunta>\nEjemplo: .ask cuando te apagan\n```";
        const canEmbed = !ctx?.guild || ctx.channel?.permissionsFor?.(ctx.guild.members.me || _client?.user)?.has("EmbedLinks");
        if (!canEmbed) {
          return safeSend(
            isEn
              ? `**Ask Command**\n**Usage:** Ask the AI a question\n**Aliases:** \`ia\`, \`ai\`\n\`\`\`js\n.ask <question>\nExample: .ask why is the sky blue\`\`\``
              : `**Comando Ask**\n**Usos:** Hazle una pregunta a la IA\n**Aliases:** \`ia\`, \`ai\`\n\`\`\`js\n.ask <pregunta>\nEjemplo: .ask cuando te apagan\`\`\``
          );
        }

        const paramErrorCard = ComponentsV2Builder.card({
          title: askTitle,
          thumbnail: bot?.displayAvatarURL?.() ?? null,
          description: askDesc,
          color: RED,
          headerSeparator: false,
        });

        return safeSend(paramErrorCard);
      }

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
      is(err, Errors.InvalidParamBoolean) ||
      is(err, Errors.InvalidParamNumber) ||
      is(err, Errors.InvalidParamChoice) ||
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
