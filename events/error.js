const { Errors } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../utils/colors");
const Logger = require("../src/core/logger");
const { sanitizeError } = require("../src/handlers/eventRuntime");

const log = new Logger("EVENT_FRAMEWORK_ERROR", process.env.LOG_LEVEL);

function is(err, Type) {
  try {
    return Type && err instanceof Type;
  } catch {
    return false;
  }
}

const event = {
  name: "frameworkError",
  once: false,
  async code(_client, err) {
    const guildId = err?.ctx?.guild?.id ?? err?.ctx?.data?.guildId;
    const userId = err?.ctx?.user?.id ?? err?.ctx?.author?.id;
    const commandName = err?.ctx?.command?.data?.name;

    const safeSend = async (payload) => {
      if (typeof err?.ctx?.send !== "function") return;
      try {
        await err.ctx.send(payload);
      } catch {}
    };

    if (is(err, Errors.GuildOnly)) {
      if (err.ctx) {
        const isDM = !err.ctx.data?.guildId;
        if (isDM) return;
        return safeSend("Este comando solo se puede usar en servidores");
      }
      return;
    }

    if (is(err, Errors.CommandNotFound)) return;

    if (is(err, Errors.NotOwner)) {
      return safeSend("Only owner lol");
    }

    if (is(err, Errors.MissingPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return safeSend(`No tienes permisos para usar este comando, necesitas: \`${permisos}\``);
    }

    if (is(err, Errors.MissingBotPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return safeSend(`No tengo permisos suficientes, necesito: \`${permisos}\``);
    }

    if (is(err, Errors.MissingBotChannelPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return safeSend(`No tengo permisos en este canal, necesito: \`${permisos}\``);
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
      const bot = err.ctx.bot.user;

      const paramerror = new EmbedBuilder()
        .setAuthor({ name: "Comando Ask", iconURL: bot.displayAvatarURL() })
        .setDescription(
          `**Usos:**\nHazle una pregunta a la IA` +
          `\n\n**Aliases:**\n\`ia\`, \`ai\`` +
          `\n\n\`\`\`js\n.ask <pregunta>\nEjemplo: .ask cuando te apagan\`\`\``
        )
        .setColor(RED);

      return safeSend({ embeds: [paramerror] });
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
      is(err, Errors.NotParamBoolean) ||
      is(err, Errors.NotParamNumber) ||
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
