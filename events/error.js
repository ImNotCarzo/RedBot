const { Errors } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../utils/colors");
const Logger = require("../src/logger");
const { sanitizeError } = require("../src/runtime");

const log = new Logger("EVENT_FRAMEWORK_ERROR", process.env.LOG_LEVEL);

function is(err, Type) {
  try {
    return Type && err instanceof Type;
  } catch {
    return false;
  }
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

  const isDiscordPermError =
    err?.code === 50013 ||
    err?.code === 50006 ||
    (typeof err?.message === "string" && (
      err.message.includes("Missing Permissions") ||
      err.message.includes("Cannot send an empty message")
    ));

  if (!missing.length && isDiscordPermError) {
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
    const userId = ctx?.user?.id ?? ctx?.author?.id;
    const commandName = ctx?.command?.data?.name;

    const safeSend = async (payload) => {
      const data = typeof payload === "string" ? { content: payload } : payload;
      const cleanData = typeof payload === "string" ? { content: payload, embeds: [] } : payload;

      try {
        if (ctx?._thinkingMessage?.edit) {
          return await ctx._thinkingMessage.edit(cleanData);
        }

        if (ctx?.interaction) {
          if (ctx.interaction.deferred || ctx.interaction.replied) {
            return await ctx.interaction.editReply(cleanData);
          }
          return await ctx.interaction.reply(data);
        }

        if (typeof ctx?.send === "function") {
          return await ctx.send(data);
        }

        if (ctx?.channel?.send) {
          return await ctx.channel.send(data);
        }
      } catch (sendErr) {
        try {
          if (ctx?.channel?.send) {
            await ctx.channel.send(typeof data === "object" ? data.content || "" : String(payload));
          }
        } catch {}
      }
    };

    if (is(err, Errors.GuildOnly)) {
      return safeSend("Este comando solo se puede usar en servidores");
    }

    if (is(err, Errors.CommandNotFound)) return;

    if (is(err, Errors.NotOwner)) {
      return safeSend("Este comando solo puede ser utilizado por el dueño del bot");
    }

    if (is(err, Errors.MissingPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return safeSend(`No tienes permisos para usar este comando, necesitas: \`${permisos}\``);
    }

    const isDiscordPermError =
      err?.code === 50013 ||
      err?.code === 50006 ||
      (typeof err?.message === "string" && (
        err.message.includes("Missing Permissions") ||
        err.message.includes("Cannot send an empty message")
      ));

    if (
      is(err, Errors.MissingBotPermission) ||
      is(err, Errors.MissingBotChannelPermission) ||
      isDiscordPermError
    ) {
      const missing = resolveMissingBotPermissions(ctx, err, _client);
      const permisos = missing.length ? missing.join(", ") : "los requeridos";
      return safeSend(`No tengo permisos suficientes en este canal, necesito: \`${permisos}\``);
    }

    if (is(err, Errors.MissingChannelPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return safeSend(`No tienes permisos en este canal, necesitas: \`${permisos}\``);
    }

    if (is(err, Errors.OnlyForIDs)) {
      return safeSend("Este comando solo lo pueden usar usuarios específicos");
    }

    if (is(err, Errors.MissingRequiredParam)) {
      if (!err.ctx) return;
      const bot = err.ctx?.bot?.user ?? _client?.user;

      if (commandName === "ask" || err.param?.name === "pregunta") {
        const canEmbed = !ctx?.guild || ctx.channel?.permissionsFor?.(ctx.guild.members.me || _client?.user)?.has("EmbedLinks");
        if (!canEmbed) {
          return safeSend(
            `**Comando Ask**\n**Usos:** Hazle una pregunta a la IA\n**Aliases:** \`ia\`, \`ai\`\n\`\`\`js\n.ask <pregunta>\nEjemplo: .ask cuando te apagan\`\`\``
          );
        }

        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Ask", iconURL: bot?.displayAvatarURL?.() })
          .setDescription(
            `**Usos:**\nHazle una pregunta a la IA` +
            `\n\n**Aliases:**\n\`ia\`, \`ai\`` +
            `\n\n\`\`\`js\n.ask <pregunta>\nEjemplo: .ask cuando te apagan\`\`\``
          )
          .setColor(RED);

        return safeSend({ embeds: [paramerror] });
      }

      const paramName = err.param?.name ?? "requerido";
      return safeSend(`Falta el parámetro requerido: \`${paramName}\``);
    }
    
    if (is(err, Errors.NotNSFW)) {
      return safeSend("Este comando solo se puede usar en canales NSFW");
    }

    if (is(err, Errors.NotInChannelType)) {
      return safeSend("No puedes usar este comando en este tipo de canal");
    }

    if (is(err, Errors.InvalidParamMember)) {
      return safeSend("No encontré ese usuario en el servidor");
    }

    if (is(err, Errors.InvalidParamChannel)) {
      return safeSend("No encontré ese canal");
    }

    if (is(err, Errors.InvalidParamRole)) {
      return safeSend("No encontré ese rol");
    }

    if (
      is(err, Errors.InvalidParamBoolean) ||
      is(err, Errors.InvalidParamNumber) ||
      is(err, Errors.InvalidParamChoice) ||
      is(err, Errors.InvalidChannelType)
    ) {
      return safeSend(`Parámetro inválido: \`${err.message ?? "valor incorrecto"}\``);
    }

    if (is(err, Errors.UnknownCommandError)) {
      return safeSend("Ocurrió un error desconocido con el comando");
    }

    log.error("FrameworkError no categorizado", {
      event: "frameworkError",
      guildId,
      userId,
      commandName,
      err: sanitizeError(err),
    });
    return safeSend("Ocurrió un error interno al ejecutar el comando.");
  },
};

module.exports = { data: event };
