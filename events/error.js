const { Errors } = require("erine");

function is(err, Type) {
  try {
    return Type && err instanceof Type;
  } catch {
    return false;
  }
}

const event = {
  name: "error",
  async code(client, err) {

    // Slash en DMs — erine lo bloquea antes del code, ignorar silenciosamente
    if (is(err, Errors.GuildOnly)) {
      // Si tiene ctx y es DM, intentar responder igual
      if (err.ctx) {
        const isDM = !err.ctx.data?.guildId;
        if (isDM) return; // no hay nada que hacer, erine ya bloqueó
        return err.ctx.send("Este comando solo se puede usar en servidores");
      }
      return;
    }

    if (is(err, Errors.CommandNotFound)) return; // silencioso

    if (is(err, Errors.NotOwner)) {
      return err.ctx?.send("Only owner lol");
    }

    if (is(err, Errors.MissingPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return err.ctx?.send(`No tienes permisos para usar este comando, necesitas: \`${permisos}\``);
    }

    if (is(err, Errors.MissingBotPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return err.ctx?.send(`No tengo permisos suficientes, necesito: \`${permisos}\``);
    }

    if (is(err, Errors.MissingBotChannelPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return err.ctx?.send(`No tengo permisos en este canal, necesito: \`${permisos}\``);
    }

    if (is(err, Errors.MissingChannelPermission)) {
      const permisos = err.permissions?.join(", ") || "los requeridos";
      return err.ctx?.send(`No tienes permisos en este canal, necesitas: \`${permisos}\``);
    }

    if (is(err, Errors.OnlyForIDs)) {
      return err.ctx?.send("Este comando solo lo pueden usar usuarios específicos");
    }

    if (is(err, Errors.NotNSFW)) {
      return err.ctx?.send("Este comando solo se puede usar en canales NSFW");
    }

    if (is(err, Errors.NotInChannelType)) {
      return err.ctx?.send("No puedes usar este comando en este tipo de canal");
    }

    if (is(err, Errors.InvalidParamMember)) {
      return err.ctx?.send("No encontré ese usuario en el servidor");
    }

    if (is(err, Errors.InvalidParamChannel)) {
      return err.ctx?.send("No encontré ese canal");
    }

    if (is(err, Errors.InvalidParamRole)) {
      return err.ctx?.send("No encontré ese rol");
    }

    if (is(err, Errors.MissingRequiredParam)) {
      return err.ctx?.send(`Falta un parámetro requerido: \`${err.param?.name ?? "desconocido"}\``);
    }

    if (
      is(err, Errors.NotParamBoolean) ||
      is(err, Errors.NotParamNumber) ||
      is(err, Errors.InvalidParamChoice) ||
      is(err, Errors.InvalidChannelType)
    ) {
      return err.ctx?.send(`Parámetro inválido: \`${err.message ?? "valor incorrecto"}\``);
    }

    if (is(err, Errors.UnknownCommandError)) {
      return err.ctx?.send("Ocurrió un error desconocido con el comando");
    }

    // Cualquier otra cosa
    console.error("[Erine Error]", err);
  },
};

module.exports = { data: event };