const STRINGS = {
  es: {
    "error.guild_only": "Este comando solo se puede usar en servidores",
    "error.not_owner": "Este comando solo puede ser utilizado por el dueño del bot",
    "error.missing_perm": "No tienes permisos para usar este comando, necesitas: `{perms}`",
    "error.missing_bot_perm": "No tengo permisos suficientes en este canal, necesito: `{perms}`",
    "error.missing_channel_perm": "No tienes permisos en este canal, necesitas: `{perms}`",
    "error.only_ids": "Este comando solo lo pueden usar usuarios específicos",
    "error.cooldown": "Espera `{secs}s` antes de volver a usar este comando",
    "error.missing_param": "Falta el parámetro requerido: `{param}`",
    "error.not_nsfw": "Este comando solo se puede usar en canales NSFW",
    "error.wrong_channel_type": "No puedes usar este comando en este tipo de canal",
    "error.invalid_member": "No encontré ese usuario en el servidor",
    "error.invalid_channel": "No encontré ese canal",
    "error.invalid_role": "No encontré ese rol",
    "error.invalid_param": "Parámetro inválido: `{detail}`",
    "error.unknown_command": "Ocurrió un error desconocido con el comando",
    "error.internal": "Ocurrió un error interno al ejecutar el comando.",

    "lang.updated": "Idioma del servidor cambiado a **Español** (`es`).",
    "lang.no_perm": "Necesitas el permiso **Administrar servidor** para cambiar el idioma.",
    "lang.only_guild": "Este comando solo se puede usar dentro de un servidor.",

    "welcome.title": "¡Hola! Soy RedBot",
    "welcome.desc": "Detecté la región del servidor y configuré el idioma inicial automáticamente. Puedes cambiarlo en cualquier momento con los botones de abajo o usando `/util setlang`.\n\nHello! I configured the initial language from your server locale. You can switch anytime below or with `/util setlang`.",
    "welcome.current": "Idioma actual",
    "welcome.btn_es": "Español",
    "welcome.btn_en": "English",

    "ask.empty": "Escribe algo para conversar conmigo.",
    "ask.error": "No pude responder en este momento.",
    "ask.new_chat": "Conversación reiniciada.",

    "reminders.title": "Tus recordatorios activos",
    "reminders.empty": "No tienes recordatorios activos.",
    "reminders.select_placeholder": "Selecciona un recordatorio para cancelar",
    "reminders.cancel_all": "Cancelar todos",
    "reminders.cancelled_one": "Recordatorio cancelado: **{text}**",
    "reminders.cancelled_all": "Se cancelaron **{count}** recordatorio(s).",
    "reminders.not_found": "Ese recordatorio ya no está activo.",

    "setup.lang_label": "Idioma",
    "setup.warn_auto_label": "Auto-mute por warns",
    "setup.warn_auto_off": "Desactivado",
    "setup.warn_auto_val": "{count} warns → {duration}",
    "setup.btn_lang": "Idioma: {lang}",
    "setup.btn_warn_auto": "Auto-mute warns",

    "warn.auto_muted": "Auto-moderación: usuario silenciado {duration} al alcanzar {count} advertencias.",

    "passive.ban_add": "Baneo detectado (Audit)",
    "passive.ban_remove": "Desbaneo detectado (Audit)",
    "passive.member_leave": "Miembro salió / expulsado",
    "passive.channel_delete": "Canal eliminado",
    "passive.role_delete": "Rol eliminado",
    "passive.target": "Objetivo",
    "passive.executor": "Moderador",
    "passive.reason": "Razón",
    "passive.no_reason": "Sin razón especificada",
    "passive.unknown": "Desconocido",
  },
  en: {
    "error.guild_only": "This command can only be used in servers",
    "error.not_owner": "This command can only be used by the bot owner",
    "error.missing_perm": "You don't have permission to use this command, required: `{perms}`",
    "error.missing_bot_perm": "I don't have enough permissions in this channel, I need: `{perms}`",
    "error.missing_channel_perm": "You don't have permission in this channel, required: `{perms}`",
    "error.only_ids": "This command can only be used by specific users",
    "error.cooldown": "Wait `{secs}s` before using this command again",
    "error.missing_param": "Missing required parameter: `{param}`",
    "error.not_nsfw": "This command can only be used in NSFW channels",
    "error.wrong_channel_type": "You cannot use this command in this channel type",
    "error.invalid_member": "I couldn't find that user in the server",
    "error.invalid_channel": "I couldn't find that channel",
    "error.invalid_role": "I couldn't find that role",
    "error.invalid_param": "Invalid parameter: `{detail}`",
    "error.unknown_command": "An unknown error occurred with this command",
    "error.internal": "An internal error occurred while running the command.",

    "lang.updated": "Server language changed to **English** (`en`).",
    "lang.no_perm": "You need the **Manage Server** permission to change the language.",
    "lang.only_guild": "This command can only be used inside a server.",

    "welcome.title": "Hi! I'm RedBot",
    "welcome.desc": "I detected your server locale and set the initial language automatically. You can switch anytime using the buttons below or `/util setlang`.\n\n¡Hola! Configuré el idioma inicial según tu servidor. Puedes cambiarlo abajo o con `/util setlang`.",
    "welcome.current": "Current language",
    "welcome.btn_es": "Español",
    "welcome.btn_en": "English",

    "ask.empty": "Write something to talk with me.",
    "ask.error": "I couldn't respond right now.",
    "ask.new_chat": "Conversation reset.",

    "reminders.title": "Your active reminders",
    "reminders.empty": "You don't have any active reminders.",
    "reminders.select_placeholder": "Select a reminder to cancel",
    "reminders.cancel_all": "Cancel all",
    "reminders.cancelled_one": "Reminder cancelled: **{text}**",
    "reminders.cancelled_all": "Cancelled **{count}** reminder(s).",
    "reminders.not_found": "That reminder is no longer active.",

    "setup.lang_label": "Language",
    "setup.warn_auto_label": "Warn auto-mute",
    "setup.warn_auto_off": "Disabled",
    "setup.warn_auto_val": "{count} warns → {duration}",
    "setup.btn_lang": "Language: {lang}",
    "setup.btn_warn_auto": "Warn auto-mute",

    "warn.auto_muted": "Auto-moderation: user timed out for {duration} after reaching {count} warnings.",

    "passive.ban_add": "Ban detected (Audit)",
    "passive.ban_remove": "Unban detected (Audit)",
    "passive.member_leave": "Member left / kicked",
    "passive.channel_delete": "Channel deleted",
    "passive.role_delete": "Role deleted",
    "passive.target": "Target",
    "passive.executor": "Moderator",
    "passive.reason": "Reason",
    "passive.no_reason": "No reason provided",
    "passive.unknown": "Unknown",
  },
};

function normalizeLang(lang) {
  return String(lang || "").toLowerCase().startsWith("en") ? "en" : "es";
}

function detectLocaleLang(locale) {
  const raw = String(locale || "").toLowerCase().trim();
  if (!raw) return "es";
  return raw.startsWith("es") ? "es" : "en";
}

function t(lang, key, vars = {}) {
  const resolved = normalizeLang(lang);
  const template = STRINGS[resolved]?.[key] ?? STRINGS.es[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

module.exports = { STRINGS, normalizeLang, detectLocaleLang, t };
