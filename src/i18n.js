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

const { AsyncLocalStorage } = require("async_hooks");

const langStorage = new AsyncLocalStorage();

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

function getCurrentLang() {
  return langStorage.getStore() || "es";
}

function runWithLang(lang, fn) {
  return langStorage.run(normalizeLang(lang), fn);
}

const EXACT_ES_TO_EN = {
  // Common / Runtime / Errors
  "Este comando solo funciona en servidores": "This command only works in servers",
  "Este comando solo se puede usar en servidores": "This command can only be used in servers",
  "Invítame": "Invite me",
  "No es tu comando": "This is not your command",
  "No puedes usar este menú": "You cannot use this menu",
  "No puedes usar estos botones": "You cannot use these buttons",
  "No encontré a ese usuario": "Could not find that user",
  "No pude encontrar al usuario": "Could not find that user",
  "Faltan parámetros requeridos para ejecutar este comando.": "Missing required parameters to run this command.",
  "Ocurrió un error ejecutando el comando": "An error occurred while running the command",
  "Ocurrió un error al procesar esta acción.": "An error occurred while processing this action.",
  "Ocurrió un error procesando la acción": "An error occurred while processing this action",
  "Error al obtener la información": "Failed to fetch bot information",
  "Moderador": "Moderator",
  "Enviados": "Sent",
  "Fallidos": "Failed",
  "Título": "Title",
  "Texto": "Text",
  "Filtros": "Filters",
  "DM masivo enviado": "Mass DM sent",
  "No tienes permisos para usar este comando, necesitas: `Administrator`": "You don't have permission to use this command, you need: `Administrator`",
  "Ya hay un DM masivo en curso en este servidor, espera a que termine": "A mass DM is already in progress in this server, wait for it to finish",
  "**Usos:**": "**Usage:**",
  "# Básico": "# Basic",
  "# Con imagen por URL o adjunto": "# With image via URL or attachment",
  "# Solo a un rol": "# Only to a role",
  "# Excluir un rol": "# Exclude a role",
  "# Excluir un usuario": "# Exclude a user",
  "# Todo combinado": "# All combined",

  // Setup & Server panels
  "Configuración del servidor": "Server configuration",
  "Prefijo": "Prefix",
  "Canal de logs": "Logs channel",
  "Rol automático": "Auto-role",
  "Desactivado": "Disabled",
  "desactivado": "disabled",
  "activado": "enabled",
  "Seleccionar canal de logs...": "Select logs channel...",
  "Seleccionar rol automático al entrar...": "Select auto-role on join...",
  "Autorole: Ignora bots": "Autorole: Ignores bots",
  "Autorole: Incluye bots": "Autorole: Includes bots",
  "Quitar logs": "Remove logs",
  "Quitar autorole": "Remove autorole",
  "Perfil del bot": "Bot profile",
  "Cambiar prefijo": "Change prefix",
  "Nuevo prefijo (1 a 3 caracteres)": "New prefix (1 to 3 characters)",
  "El canal debe ser de texto": "The channel must be a text channel",
  "No puedes seleccionar `@everyone`": "You cannot select `@everyone`",
  "Ese rol es gestionado por una integración y no se puede asignar": "That role is managed by an integration and cannot be assigned",
  "Ese rol es igual o superior a mi rol más alto": "That role is equal to or higher than my highest role",
  "Rol join configurado": "Join role configured",
  "Rol": "Role",
  "Ignorar bots": "Ignore bots",
  "Rol automático al entrar desactivado": "Auto-role on join disabled",
  "El prefix no puede tener más de 3 caracteres": "The prefix cannot exceed 3 characters",

  // Custombot / Server info / History
  "Perfil en el servidor": "Server profile",
  "Apodo": "Nickname",
  "Avatar del servidor": "Server avatar",
  "Banner del servidor": "Server banner",
  "Personalizado": "Custom",
  "Sin apodo": "No nickname",
  "Biografía": "Bio",
  "Dejar vacío para no cambiar": "Leave blank to keep current",
  "Editar perfil": "Edit profile",
  "Restablecer todo": "Reset all",
  "No cambió nada": "Nothing changed",
  "Cambios aplicados": "Changes applied",
  "Por Defecto": "Default",
  "Por defecto": "Default",
  "Nuevo": "New",
  "Perfil del bot actualizado": "Bot profile updated",
  "Cambios": "Changes",
  "Perfil del bot restablecido": "Bot profile reset",
  "Campo": "Field",
  "No se pudo actualizar el perfil del bot": "Could not update the bot profile",
  "No se pudo restablecer el perfil del bot": "Could not reset the bot profile",
  "No se pudo abrir el panel de configuración": "Could not open the setup panel",
  "Debes proporcionar al menos una opción para actualizar": "You must provide at least one option to update",
  "Campo inválido. Usa: `todo`, `avatar`, `banner`, `biografia` o `apodo`": "Invalid field. Use: `todo`, `avatar`, `banner`, `biografia`, or `apodo`",
  "Necesito el permiso **Cambiar apodo** (`ChangeNickname`) para modificar mi apodo en este servidor": "I need the **Change Nickname** (`ChangeNickname`) permission to change my nickname in this server",
  "Necesito el permiso **Cambiar apodo** (`ChangeNickname`) para restablecer mi apodo en este servidor": "I need the **Change Nickname** (`ChangeNickname`) permission to reset my nickname in this server",
  "Intenta de nuevo en unos minutos.": "Try again in a few minutes.",
  "No tengo permisos suficientes en este servidor.": "I don't have enough permissions in this server.",
  "Todo (avatar, banner, biografía y apodo)": "All (avatar, banner, bio, and nickname)",
  "Ninguno": "None",
  "Bajo": "Low",
  "Medio": "Medium",
  "Alto": "High",
  "Muy alto": "Very high",
  "Dueño": "Owner",
  "No disponible": "Unavailable",
  "Creación": "Created",
  "Tag": "Vanity",
  "Estadísticas": "Statistics",
  "Miembros": "Members",
  "Canales": "Channels",
  "Seguridad": "Security",
  "Verificación": "Verification",
  "Logo": "Icon",
  "Logo del servidor": "Server icon",
  "Roles del servidor": "Server roles",
  "Emojis del servidor": "Server emojis",
  "Información del servidor": "Server information",
  "Navegar...": "Browse...",
  "Este servidor no tiene logo": "This server has no icon",
  "Este servidor no tiene banner": "This server has no banner",
  "Este servidor no tiene emojis": "This server has no emojis",
  "Este servidor no tiene roles": "This server has no roles",
  "No hay roles": "No roles found",
  "No hay historial guardado todavía": "No history saved yet",

  // User & Badges
  "Sin insignias": "No badges",
  "Insignias": "Badges",
  "Color del rol": "Role color",
  "Cuenta creada": "Account created",
  "Servidor": "Server",
  "Ingreso": "Joined",
  "Tag de servidor": "Server tag",
  "Etiqueta": "Tag",
  "ID del servidor": "Server ID",
  "Insignia": "Badge",
  "Sin insignia": "No badge",
  "Decoraciones": "Decorations",
  "Decoración de avatar": "Avatar decoration",
  "Activa": "Active",
  "Placa de nombre": "Nameplate",
  "Ver placa": "View nameplate",
  "Información del usuario": "User information",
  "Avatar del usuario": "User avatar",
  "Banner del usuario": "User banner",
  "Roles del usuario": "User roles",
  "Permisos del usuario": "User permissions",
  "Avatar del Servidor": "Server Avatar",
  "Avatar Global": "Global Avatar",
  "Avatar de servidor": "Server avatar",
  "Avatar global": "Global avatar",
  "Banner del Servidor": "Server Banner",
  "Banner Global": "Global Banner",
  "Banner de servidor": "Server banner",
  "Banner global": "Global banner",
  "Tipo de avatar...": "Avatar type...",
  "Tipo de banner...": "Banner type...",
  "Este usuario no tiene banner": "This user has no banner",
  "Este usuario no tiene roles": "This user has no roles",
  "Este usuario no tiene permisos": "This user has no permissions",
  "No se encontraron miembros en el servidor": "No members found in this server",
  "Usuario al azar": "Random user",
  "Seleccionado": "Selected",
  "Rol filtrado": "Filtered role",
  "Abrir imagen": "Open image",
  "Historial": "History",
  "Personal de Discord": "Discord Staff",
  "Servidor Socio": "Discord Partner",
  "Eventos HypeSquad": "HypeSquad Events",
  "Cazador de Errores": "Bug Hunter Level 1",
  "Cazador de Errores (Oro)": "Bug Hunter Level 2",
  "Partidario Inicial de Nitro": "Early Nitro Supporter",
  "Equipo de Discord": "Discord Team",
  "Bot Verificado": "Verified Bot",
  "Desarrollador de Bots Verificado": "Verified Bot Developer",
  "Moderador Certificado": "Certified Moderator",
  "Interacciones HTTP": "HTTP Interactions",
  "Desarrollador Activo": "Active Developer",
  "En Cuarentena": "Quarantined",
  "Colaborador": "Collaborator",
  "Colaborador Restringido": "Restricted Collaborator",

  // Channel
  "Canal": "Channel",
  "Detalle": "Details",
  "No se pudo obtener el canal": "Could not fetch the channel",
  "Desconocido": "Unknown",
  "Tema": "Topic",
  "Posición": "Position",
  "Tipo": "Type",
  "Configuración": "Settings",
  "Voz": "Voice",
  "Categoría": "Category",
  "Anuncios": "Announcements",
  "Foro": "Forum",
  "Escenario": "Stage",
  "Directorio": "Directory",
  "Sí": "Yes",
  "Canal renombrado": "Channel renamed",
  "Antes": "Before",
  "Ahora": "After",
  "No se pudo renombrar el canal": "Could not rename the channel",
  "Canal bloqueado": "Channel locked",
  "No se pudo bloquear el canal": "Could not lock the channel",
  "Canal desbloqueado": "Channel unlocked",
  "No se pudo desbloquear el canal": "Could not unlock the channel",
  "Tiempo inválido. Usa `5s`, `10m`, `1h` o `0` para desactivar. Máximo 6h.": "Invalid duration. Use `5s`, `10m`, `1h`, or `0` to disable. Max 6h.",
  "Slowmode desactivado": "Slowmode disabled",
  "Slowmode establecido": "Slowmode set",
  "Slowmode actualizado": "Slowmode updated",
  "No se pudo cambiar el slowmode": "Could not update slowmode",
  "¿Estás seguro?": "Are you sure?",
  "Al confirmar esta acción, el canal será **borrado** y posteriormente clonado con los mismos permisos": "By confirming this action, the channel will be **deleted** and cloned with the same permissions",
  "Todos los mensajes se borrarán": "All messages will be deleted",
  "Confirmar": "Confirm",
  "Cancelar": "Cancel",
  "Nuke cancelado": "Nuke cancelled",
  "Confirmación expirada": "Confirmation expired",
  "Canal nukeado": "Channel nuked",
  "Nuevo ID": "New ID",
  "Canal nukeado correctamente": "Channel nuked successfully",
  "No se pudo nukear el canal": "Could not nuke the channel",
  "Canal clonado": "Channel cloned",
  "Clon": "Clone",
  "No se pudo clonar el canal": "Could not clone the channel",
  "Acceso concedido": "Access granted",
  "No se pudo dar acceso al usuario": "Could not grant channel access to user",
  "Acceso denegado": "Access denied",
  "No se pudo quitar el acceso al usuario": "Could not remove channel access from user",
  "Canal ocultado": "Channel hidden",
  "No se pudo ocultar el canal": "Could not hide the channel",
  "No hay suficientes mensajes para resumir": "Not enough messages to summarize",
  "No pude generar un resumen": "Could not generate a summary",
  "No pude leer el historial de este canal": "Could not read this channel's history",
  "No hay mensajes borrados recientes en este canal": "No recently deleted messages in this channel",

  // Role
  "Rol no encontrado": "Role not found",
  "No puedo editar roles gestionados por integraciones": "I cannot edit integration-managed roles",
  "No puedo editar el rol @everyone": "I cannot edit the @everyone role",
  "No puedo actuar sobre ese rol porque está por encima del mío": "I cannot act on that role because it is above mine",
  "No puedes gestionar un rol con igual o mayor posición que tu rol más alto": "You cannot manage a role equal to or higher than your highest role",
  "Ya hay una operación masiva ejecutándose para este rol en este servidor.": "A bulk operation is already running for this role in this server.",
  "Añadiendo rol": "Adding role",
  "Quitando rol": "Removing role",
  "Añadidos": "Added",
  "Quitados": "Removed",
  "Procesados": "Processed",
  "Role all ejecutado": "Role all completed",
  "Role removeall ejecutado": "Role removeall completed",
  "Role bots ejecutado": "Role bots completed",
  "Role humans ejecutado": "Role humans completed",
  "Sin color": "No color",
  "Mencionable": "Mentionable",
  "Gestionado": "Managed",
  "Separado": "Hoisted",
  "Información": "Information",
  "Icono del rol": "Role icon",
  "Rol añadido": "Role added",
  "Rol removido": "Role removed",
  "No se pudo asignar el rol": "Could not assign the role",
  "No se pudo quitar el rol": "Could not remove the role",
  "Hoist activado": "Hoist enabled",
  "Hoist desactivado": "Hoist disabled",
  "Hoist de rol actualizado": "Role hoist updated",
  "No se pudo cambiar el hoist": "Could not toggle hoist",
  "Mencionable activado": "Mentionable enabled",
  "Mencionable desactivado": "Mentionable disabled",
  "Mencionable de rol actualizado": "Role mentionable updated",
  "No se pudo cambiar la mencionabilidad": "Could not toggle mentionable",
  "Estado": "State",
  "Acción": "Action",
  "Añadir": "Add",
  "Quitar": "Remove",
  "No encontré ese rol": "Could not find that role",
  "No pude encontrar el rol": "Could not find that role",
  "Este rol no tiene icono": "This role has no icon",
  "Este rol no tiene color asignado": "This role has no assigned color",
  "Sin color asignado": "No assigned color",
  "Sin permisos": "No permissions",
  "Este rol no tiene permisos": "This role has no permissions",
  "Nadie tiene este rol": "No one has this role",
  "Color del rol": "Role color",
  "Permisos del rol": "Role permissions",
  "Usuarios con este rol": "Users with this role",
  "Icono": "Icon",
  "Información del rol": "Role information",
  "Rol renombrado": "Role renamed",
  "No se pudo renombrar el rol": "Could not rename the role",
  "No hay un rol automático configurado": "No auto-role is configured",
  "Rol automático desactivado": "Auto-role disabled",
  "Ya no se asignará un rol automático al entrar": "Members will no longer receive an auto-role on join",
  "Rol automático configurado": "Auto-role configured",

  // Mod & AutoMod
  "Sin razón": "No reason",
  "No pude obtener al miembro en el servidor": "Could not find that member in this server",
  "Usuario baneado": "User banned",
  "Mensajes borrados": "Deleted messages",
  "No pude banear al usuario": "Could not ban user",
  "Ese usuario no está baneado": "That user is not banned",
  "Usuario desbaneado": "User unbanned",
  "No se pudo desbanear al usuario, verifica que el ID sea correcto": "Could not unban user, verify the ID is correct",
  "Usuario softbaneado": "User softbanned",
  "Mensajes": "Messages",
  "El usuario puede volver a entrar al servidor": "The user can rejoin the server",
  "No pude softbanear al usuario": "Could not softban user",
  "Duración inválida. Usa: `30s`, `10m`, `2h`, `1d`": "Invalid duration. Use: `30s`, `10m`, `2h`, `1d`",
  "La duración máxima es 28 días": "Maximum duration is 28 days",
  "Usuario tempbaneado": "User tempbanned",
  "Duración": "Duration",
  "Expira": "Expires",
  "No pude hacer el tempban": "Could not apply tempban",
  "Debes seleccionar al menos un usuario": "You must select at least one user",
  "Usuarios baneados": "Users banned",
  "Baneados": "Banned",
  "No se pudo banear a": "Failed to ban",
  "Massban ejecutado": "Massban executed",
  "Usuario expulsado": "User kicked",
  "No se pudo expulsar al usuario": "Could not kick user",
  "La duración máxima de timeout es 28 días": "Maximum timeout duration is 28 days",
  "Usuario silenciado": "User muted",
  "No se pudo silenciar al usuario": "Could not mute user",
  "Ese usuario no está silenciado": "That user is not muted",
  "Silencio removido": "Timeout removed",
  "No se pudo quitar el timeout": "Could not remove timeout",
  "Ingresa un número válido entre 1 y 100": "Enter a valid number between 1 and 100",
  "No hay mensajes recientes para borrar": "No recent messages found to delete",
  "Mensajes eliminados": "Messages deleted",
  "Cantidad": "Amount",
  "Purge ejecutado": "Purge executed",
  "Filtro": "Filter",
  "No pude eliminar los mensajes — pueden ser demasiado antiguos": "Could not delete messages — they may be too old",
  "No puedes advertir a un bot": "You cannot warn a bot",
  "No puedes advertir a alguien con igual o mayor rango que el tuyo": "You cannot warn someone with an equal or higher role than yours",
  "ID de advertencia": "Warning ID",
  "Auto-moderación": "Auto-moderation",
  "Usuario advertido": "User warned",
  "Usuario Advertido": "User warned",
  "Total warns": "Total warnings",
  "No se pudo registrar la advertencia": "Could not issue warning",
  "Advertencia eliminada": "Warning removed",
  "No se pudo eliminar la advertencia": "Could not remove warning",
  "Advertencias eliminadas": "Warnings cleared",
  "No se pudieron limpiar las advertencias": "Could not clear warnings",
  "No se pudieron obtener las advertencias": "Could not retrieve warnings",
  "Canal de logs establecido": "Logs channel set",
  "No se pudo establecer el canal de logs": "Could not set the logs channel",
  "No hay un canal de logs configurado": "No logs channel is configured",
  "Logs desactivados": "Logs disabled",
  "Ya no se enviarán logs en este servidor": "Logs will no longer be sent in this server",
  "No se pudo desactivar los logs": "Could not disable logs",
  "Mensaje bloqueado": "Message blocked",
  "Alerta enviada": "Alert sent",
  "Timeout aplicado": "Timeout applied",
  "Interacción bloqueada": "Interaction blocked",
  "Acción de AutoMod": "AutoMod action",
  "AutoMod ejecutado": "AutoMod triggered",
  "Coincidencia": "Matched keyword",
  "Contenido": "Content",

  // Util & Context Menus & Reminders
  "Mensaje": "Message",
  "Versión": "Version",
  "Servidores": "Servers",
  "Usuarios": "Users",
  "Tiempo activo": "Uptime",
  "Creador": "Creator",
  "Invitar": "Invite",
  "Soporte": "Support",
  "Invítame a tu servidor o únete al servidor de soporte.": "Invite me to your server or join the support server.",
  "Prefix actual": "Current prefix",
  "Prefix actualizado": "Prefix updated",
  "Anterior": "Previous",
  "Historial reiniciado": "History cleared",
  "Se limpió tu conversación con la IA.": "Your AI conversation history has been cleared.",
  "Sin motivo": "No reason",
  "Motivo": "Reason",
  "Desde": "Since",
  "Ahora estás AFK": "You are now AFK",
  "Debes ingresar un emoji válido": "You must enter a valid emoji",
  "No pude encontrar ese emoji": "Could not find that emoji",
  "No se pudo generar la traducción": "Could not generate translation",
  "Traducción": "Translation",
  "Resultado": "Result",
  "Google Translate está saturado, intenta en unos segundos": "Google Translate is rate-limited, try again in a few seconds",
  "No se pudo conectar con el servicio de traducción": "Could not connect to the translation service",
  "Debes proporcionar un enlace válido (`https://...`)": "You must provide a valid URL (`https://...`)",
  "No pude extraer ningún video de ese enlace. Verifica que sea público y contenga un video.": "Could not extract any video from that link. Make sure it is public and contains a video.",
  "No se pudo descargar el video en este momento. Intenta con otro enlace.": "Could not download the video right now. Try another link.",
  "Debes adjuntar una imagen": "You must attach an image",
  "El archivo debe ser una imagen (jpg, png, gif, webp)": "The file must be an image (jpg, png, gif, webp)",
  "La imagen no puede superar los 8MB": "The image cannot exceed 8MB",
  "Descripción de imagen": "Image description",
  "No pude generar una descripción": "Could not generate a description",
  "Debes adjuntar un audio o video": "You must attach an audio or video file",
  "Formato no soportado. Usa: mp3, wav, ogg, webm, mp4, m4a, flac, mov": "Unsupported format. Use: mp3, wav, ogg, webm, mp4, m4a, flac, mov",
  "El archivo no puede superar los 25MB": "The file cannot exceed 25MB",
  "No se detectó voz inteligible en el archivo": "No intelligible speech detected in the file",
  "Transcripción": "Transcription",
  "El texto supera el límite del mensaje, se adjunta como archivo.": "The text exceeds the message limit, attached as a file.",
  "Enviando DM masivo": "Sending Mass DM",
  "Progreso": "Progress",
  "DM masivo en curso": "Mass DM in progress",
  "Ya hay un envío activo en este servidor, espera a que termine.": "There is already an active broadcast in this server, wait for it to finish.",
  "DM masivo completado": "Mass DM completed",
  "Solo rol": "Only role",
  "Rol excluido": "Excluded role",
  "Usuario excluido": "Excluded user",
  "El texto es demasiado corto para resumir": "The text is too short to summarize",
  "El mensaje es demasiado corto para resumir": "The message is too short to summarize",
  "Resumen": "Summary",
  "La pregunta debe tener entre 1 y 300 caracteres": "The question must be between 1 and 300 characters",
  "Debes dar entre 2 y 10 opciones separadas por `/`": "You must provide between 2 and 10 options separated by `/`",
  "Cada opción puede tener como máximo 55 caracteres": "Each option can be at most 55 characters long",
  "Tiempo inválido. Usa `30s`, `10m`, `2h`, `1d` o `1w` (entre 10s y 365d)": "Invalid duration. Use `30s`, `10m`, `2h`, `1d`, or `1w` (between 10s and 365d)",
  "Debes indicar qué quieres que te recuerde": "You must specify what you want to be reminded about",
  "Recordatorio creado": "Reminder created",
  "Recordatorio": "Reminder",
  "No se detectó texto legible en la imagen": "No readable text detected in the image",
  "Texto extraído": "Extracted text",
  "Recordar mensaje": "Remind about message",
  "¿Cuándo quieres el recordatorio?": "When do you want the reminder?",
  "En 15 minutos": "In 15 minutes",
  "En 1 hora": "In 1 hour",
  "Mañana (24 horas)": "Tomorrow (24 hours)",
  "Tiempo personalizado (escríbelo abajo)": "Custom time (type it below)",
  "Tiempo personalizado": "Custom time",
  "Solo si elegiste la opción personalizada": "Only if you chose the custom option",
  "Ej: 30m, 4h, 2d": "Ex: 30m, 4h, 2d",
  "Nota adicional (opcional)": "Additional note (optional)",
  "Ej: Responder a este mensaje": "Ex: Reply to this message",
  "Advertir": "Warn",
  "Expulsar": "Kick",
  "Razón": "Reason",
  "Escribe el motivo...": "Enter the reason...",
  "Fuera del servidor": "Not in server",
  "Warns totales": "Total warnings",
  "Mute activo": "Active timeout",
  "Últimas advertencias": "Latest warnings",
  "Sin advertencias registradas": "No warnings recorded",
  "Este mensaje no tiene texto para traducir": "This message has no text to translate",
  "Este mensaje no contiene una imagen válida": "This message does not contain a valid image",
  "Este mensaje no tiene texto para resumir": "This message has no text to summarize",
  "No tienes permisos para usar esta acción, necesitas: `ModerateMembers`": "You don't have permission to use this action, you need: `ModerateMembers`",
  "No tengo el permiso `ModerateMembers`": "I don't have the `ModerateMembers` permission",
  "No puedo silenciar a este usuario (jerarquía)": "I cannot mute this user (role hierarchy)",
  "Usuario silenciado (Expediente)": "User muted (Dossier)",
  "No tienes el permiso `KickMembers`": "You don't have the `KickMembers` permission",
  "No puedo expulsar a este usuario (jerarquía o permisos)": "I cannot kick this user (hierarchy or permissions)",
  "Usuario expulsado (Expediente)": "User kicked (Dossier)",
  "Usuario Advertido (Expediente)": "User warned (Dossier)",
  "No se pudo ejecutar la acción": "Could not execute this action",
  "No se pudo cargar el expediente del usuario": "Could not load the user's dossier",

  // Help categories, labels, and descriptions
  "/server custombot ``.custombot`` -> personaliza el avatar, banner, apodo y biografia de redbot en tu servidor":
    "/server custombot ``.custombot`` -> customize redbot's avatar, banner, nickname, and bio in your server",
  "Utilidad": "Utility",
  "Usuario": "User",
  "Moderación": "Moderation",
  "Canal": "Channel",
  "Selecciona un comando": "Select a command",
  "No encontré ese comando": "Could not find that command",
  "Uso": "Usage",
  "Descripción": "Description",
  "Alias": "Aliases",
  "Hazle una pregunta a la IA": "Ask the AI a question",
  "Establece tu estado como ausente (AFK)": "Set your status as away (AFK)",
  "Muestra un emoji en tamaño grande": "Display an emoji in full size",
  "Muestra la latencia actual del bot": "Show the bot's current latency",
  "Muestra la latencia del bot": "Show the bot's latency",
  "Muestra información general del bot": "Show general bot information",
  "Envía la invitación del bot y el servidor de soporte": "Send the bot invite and support server links",
  "Cambia o muestra el prefijo del bot en este servidor": "Change or view the bot prefix in this server",
  "Cambia o muestra el prefix del bot en este servidor": "Change or view the bot prefix in this server",
  "Limpia tu historial de conversación con la IA": "Clear your AI conversation history",
  "Traduce texto a otro idioma": "Translate text to another language",
  "Descarga un video desde un enlace": "Download a video from a link",
  "Describe el contenido de una imagen": "Describe the contents of an image",
  "Transcribe un audio o video a texto": "Transcribe an audio or video to text",
  "Resume un texto largo de 100 caracteres o más": "Summarize a long text of 100 characters or more",
  "Envía un mensaje privado a miembros del servidor": "Send a direct message to server members",
  "Envía un embed por DM a todos los miembros del servidor": "Send an embed via DM to all server members",
  "Crea una encuesta nativa de Discord": "Create a native Discord poll",
  "Te recuerda algo por mensaje privado": "Reminds you about something via DM",
  "Lista o cancela tus recordatorios activos": "List or cancel your active reminders",
  "Extrae el texto de una imagen": "Extract text from an image",
  "Cambia o muestra el idioma del servidor": "Change or view the server language",
  "Resume los últimos mensajes del canal": "Summarize the latest messages in the channel",
  "Muestra información general de un usuario": "Show general information about a user",
  "Muestra el avatar de un usuario": "Show a user's avatar",
  "Muestra el banner de un usuario": "Show a user's banner",
  "Muestra los roles de un usuario": "Show a user's roles",
  "Muestra los permisos de un usuario en el servidor": "Show a user's permissions in the server",
  "Elige a un miembro del servidor al azar": "Pick a random server member",
  "Banea a un usuario del servidor": "Ban a user from the server",
  "Desbanea a un usuario por ID": "Unban a user by ID",
  "Banea y desbanea al instante para borrar mensajes recientes": "Ban and immediately unban to delete recent messages",
  "Banea a un usuario por un tiempo determinado": "Temporarily ban a user",
  "Banea a un usuario temporalmente": "Temporarily ban a user",
  "Banea hasta 5 usuarios seleccionados": "Ban up to 5 selected users",
  "Banea a múltiples usuarios a la vez (hasta 5)": "Ban multiple users at once (up to 5)",
  "Expulsa a un usuario del servidor": "Kick a user from the server",
  "Expulsa a un usuario del servidor borrando sus mensajes": "Kick a user while deleting their recent messages",
  "Silencia a un usuario con timeout": "Timeout a user",
  "Silencia a un usuario del servidor": "Timeout a server user",
  "Quita el timeout a un usuario": "Remove a user's timeout",
  "Quita el mute a un usuario": "Unmute a user",
  "Elimina mensajes del canal": "Delete messages from the channel",
  "Advierte a un usuario": "Warn a user",
  "Elimina una advertencia por su ID": "Remove a warning by its ID",
  "Borra todas las advertencias de un usuario": "Clear all warnings from a user",
  "Borra las advertencias de un usuario": "Clear a user's warnings",
  "Ver advertencias de un usuario": "View a user's warnings",
  "Muestra las advertencias de un usuario": "Show a user's warnings",
  "Establece el canal de logs para RedBot": "Set the log channel for RedBot",
  "Establece el canal de logs para RedBot en el servidor": "Set the log channel for RedBot in the server",
  "Desactiva los logs de RedBot en el servidor": "Disable RedBot logs in the server",
  "Muestra información general del servidor": "Show general server information",
  "Muestra el logo del servidor": "Show the server icon",
  "Muestra el banner del servidor": "Show the server banner",
  "Muestra todos los emojis del servidor": "Show all server emojis",
  "Lista los roles del servidor": "List the server roles",
  "Personaliza avatar, banner, apodo y biografía del bot en el servidor": "Customize the bot's avatar, banner, nickname, and bio in the server",
  "Restablece el perfil personalizado del bot en el servidor": "Reset the bot's custom server profile",
  "Panel interactivo de configuración del servidor": "Interactive server configuration panel",
  "Muestra información de un rol": "Show information about a role",
  "Muestra el icono de un rol": "Show a role's icon",
  "Muestra el color de un rol": "Show a role's color",
  "Lista usuarios con un rol": "List users with a role",
  "Añade un rol a un usuario": "Add a role to a user",
  "Quita un rol a un usuario": "Remove a role from a user",
  "Renombra un rol": "Rename a role",
  "Activa o desactiva si un rol se muestra separado": "Toggle whether a role is displayed separately",
  "Activa o desactiva si un rol se muestra separado en la lista de miembros": "Toggle whether a role is displayed separately in the member list",
  "Activa o desactiva si un rol es mencionable": "Toggle whether a role is mentionable",
  "Añade un rol a todos los miembros": "Add a role to all members",
  "Quita un rol a todos los miembros que lo tengan": "Remove a role from all members who have it",
  "Añade o quita un rol a todos los bots": "Add or remove a role from all bots",
  "Añade o quita un rol a todos los usuarios": "Add or remove a role from all human users",
  "Configura o desactiva el rol automático al entrar": "Configure or disable the auto-role on join",
  "Muestra los permisos de un rol": "Show a role's permissions",
  "Muestra información de un canal": "Show information about a channel",
  "Renombra un canal": "Rename a channel",
  "Bloquea un canal para usuarios normales": "Lock a channel for regular users",
  "Abre un canal bloqueado": "Unlock a locked channel",
  "Establece el slowmode de un canal": "Set a channel's slowmode",
  "Establece un slowmode para el canal": "Set a slowmode for the channel",
  "Recrea el canal borrando todos sus mensajes": "Recreate the channel deleting all its messages",
  "Clona un canal con su configuración": "Clone a channel with its settings",
  "Da acceso a un usuario en un canal": "Grant a user access to a channel",
  "Quita el acceso a un usuario en un canal": "Remove a user's access from a channel",
  "Oculta un canal a @everyone": "Hide a channel from @everyone",
  "Muestra el último mensaje borrado recientemente en el canal": "Show the last recently deleted message in the channel",
  "Elige una opción al azar entre varias": "Pick one random option among several",
  "Pide mi opinión sin filtro sobre algo": "Ask for my unfiltered opinion on something",
  "Te doy una crítica despiadada de algo": "Get a merciless critique of something",
  "Genera una crítica despiadada de algo": "Generate a merciless critique of something",
  "Genera una excusa ridícula pero creativa": "Generate a ridiculous yet creative excuse",
  "Una teoría conspirativa sobre cualquier cosa": "A conspiracy theory about anything",
  "Genera una teoría conspirativa sobre cualquier cosa": "Generate a conspiracy theory about anything",
  "Critica despiadadamente a un usuario": "Mercilessly roast a user",
  "Ríete de algo así bien jaja": "Laugh at something lol",
};

const LANG_NAME_ES_TO_EN = {
  "Automático": "Auto",
  "Español": "Spanish",
  "Inglés": "English",
  "Portugués": "Portuguese",
  "Francés": "French",
  "Alemán": "German",
  "Italiano": "Italian",
  "Japonés": "Japanese",
  "Coreano": "Korean",
  "Chino tradicional": "Traditional Chinese",
  "Chino": "Chinese",
  "Ruso": "Russian",
  "Árabe": "Arabic",
  "Neerlandés": "Dutch",
};

const PATTERN_ES_TO_EN = [
  [/^(.*)\s+RedBot está pensando\.\.\.$/i, (_, prefix) => `${prefix}  RedBot is thinking...`],
  [/^Mi prefijo en este servidor es (.+)$/, (_, p) => `My prefix in this server is ${p}`],
  [/^Moderador: (.+)$/, (_, mod) => `Moderator: ${mod}`],
  [/^Permisos de (.+)$/, (_, name) => `Permissions of ${name}`],
  [/^Roles de (.+) \((\d+\/\d+)\)$/, (_, name, page) => `${name} Roles (${page})`],
  [/^Emojis de (.+) \((\d+)\)$/, (_, name, n) => `${name} Emojis (${n})`],
  [/^Logo de (.+)$/, (_, name) => `${name} Icon`],
  [/^Banner de (.+)$/, (_, name) => `${name} Banner`],
  [/^Historial de avatar \((.+)\)$/, (_, name) => `Avatar history (${name})`],
  [/^Historial de banner \((.+)\)$/, (_, name) => `Banner history (${name})`],
  [/^Historial de logo \((.+)\)$/, (_, name) => `Icon history (${name})`],
  [/^Advertencias de (.+)$/, (_, name) => `Warnings for ${name}`],
  [/^Usuarios con (.+) \((\d+\/\d+)\)$/, (_, name, page) => `Users with ${name} (${page})`],
  [/^(\d+) usuarios en total$/, (_, n) => `${n} total users`],
  [/^(\d+) roles en total$/, (_, n) => `${n} total roles`],
  [/^Página (\d+\/\d+) · (\d+) en total$/, (_, page, n) => `Page ${page} · ${n} total`],
  [/^Página (\d+\/\d+)$/, (_, page) => `Page ${page}`],
  [/^Imagen (\d+\/\d+) · (.+)$/, (_, page, rest) => `Image ${page} · ${rest}`],
  [/^Resumen de (#.+)$/, (_, ch) => `Summary of ${ch}`],
  [/^(\d+) mensajes analizados$/, (_, n) => `${n} messages analyzed`],
  [/^([^·]+) · Borrado (<t:[^>]+>)$/, (_, tag, ts) => `${tag} · Deleted ${ts}`],
  [/^Expediente: (.+)$/, (_, name) => `Dossier: ${name}`],
  [/^Advertir a (.+)$/, (_, name) => `Warn ${name}`],
  [/^Expulsar a (.+)$/, (_, name) => `Kick ${name}`],
  [/^([0-9.,]+) → ([0-9.,]+) caracteres$/, (_, a, b) => `${a} → ${b} characters`],
  [/^(.+) · ([0-9.,]+) caracteres$/, (_, meta, n) => `${meta} · ${n} characters`],
  [/^Código (.+) · PNG$/, (_, cps) => `Code ${cps} · PNG`],
  [/^Hasta (<t:[^>]+>)$/, (_, ts) => `Until ${ts}`],
  [/^([`]?)(.+?)\s*\(Nivel (\d+)\)\1$/, (_, tick, count, lvl) => `${tick}${count} (Level ${lvl})${tick}`],
  [/^([`]?)(\d+) días?\1$/, (_, tick, d) => `${tick}${d} day${Number(d) === 1 ? "" : "s"}${tick}`],
  [/^(\d+) días borrados$/, (_, d) => `${d} day${Number(d) === 1 ? "" : "s"} deleted`],
  [/^(.+) → (.+)$/, (full, left, right) => {
    const trLang = (s) => s.replace(/^([A-Za-zÁÉÍÓÚÑáéíóúñ ]+?)( \(.+)?$/, (m, name, rest = "") => {
      const enName = LANG_NAME_ES_TO_EN[name.trim()];
      return enName ? `${enName}${rest}` : m;
    });
    const l = trLang(left);
    const r = trLang(right);
    return l !== left || r !== right ? `${l} → ${r}` : full;
  }],
  [/^Avatar: (.+)$/, (_, v) => `Avatar: ${v.replace(/\[Nuevo\]\(/g, "[New](").replace(/^Nuevo$/, "New").replace(/^Por Defecto$/, "Default")}`],
  [/^Apodo: (.+)$/, (_, v) => `Nickname: ${v === "Por Defecto" ? "Default" : v}`],
  [/^Banner: (.+)$/, (_, v) => `Banner: ${v.replace(/\[Nuevo\]\(/g, "[New](").replace(/^Nuevo$/, "New").replace(/^Por Defecto$/, "Default")}`],
  [/^Biografia: (.+)$/, (_, v) => `Bio: ${v === "Por Defecto" ? "Default" : v}`],
  [/^\[Ver insignia\]\((.+)\)$/, (_, u) => `[View badge](${u})`],
  [/^\[Ver decoración\]\((.+)\)(.*)$/, (_, u, rest) => `[View decoration](${u})${rest.replace(/\[Tienda\]\(/g, "[Shop](")}`],
  [/^• \*\*`([^`]+)`\*\* \((<t:[^>]+>)\): (.*)$/, (_, id, ts, reason) => `• **\`${id}\`** (${ts}): ${reason === "Sin razón" ? "No reason" : reason}`],
  [/^(<@!?[^>]+>) ya tiene el rol (<@&\d+>)$/, (_, m, r) => `${m} already has the role ${r}`],
  [/^(<@!?[^>]+>) no tiene el rol (<@&\d+>)$/, (_, m, r) => `${m} does not have the role ${r}`],
  [/^No hay miembros con el rol (<@&\d+>)$/, (_, r) => `No members found with the role ${r}`],
  [/^Todos (los usuarios )?ya tienen el rol (<@&\d+>)$/, (_, u, r) => `${u ? "All users" : "Everyone"} already ${u ? "have" : "has"} the role ${r}`],
  [/^Nadie (de los usuarios )?tiene el rol (<@&\d+>)$/, (_, u, r) => `${u ? "None of the users have" : "No one has"} the role ${r}`],
  [/^No hay (bots|usuarios) a los que (añadir|quitar) el rol (<@&\d+>)$/, (_, who, act, r) =>
    `No ${who === "bots" ? "bots" : "users"} to ${act === "añadir" ? "add" : "remove"} the role ${r} ${act === "añadir" ? "to" : "from"}`],
  [/^(Añadidos|Quitados)( \(interrumpido por errores\))?$/, (_, w, int) =>
    `${w === "Añadidos" ? "Added" : "Removed"}${int ? " (interrupted due to errors)" : ""}`],
  [/^Role (all|removeall|bots|humans) ejecutado$/, (_, sub) => `Role ${sub} completed`],
  [/^(Hoist|Mencionable) (activado|desactivado)$/, (_, lbl, st) =>
    `${lbl === "Mencionable" ? "Mentionable" : "Hoist"} ${st === "activado" ? "enabled" : "disabled"}`],
  [/^(<#\d+>) fue (cerrado|abierto|ocultado)$/, (_, ch, st) =>
    `${ch} has been ${st === "cerrado" ? "locked" : st === "abierto" ? "unlocked" : "hidden"}`],
  [/^(<@!?\d+>) ahora tiene acceso a (<#\d+>)$/, (_, m, ch) => `${m} now has access to ${ch}`],
  [/^(<@!?\d+>) ya no tiene acceso a (<#\d+>)$/, (_, m, ch) => `${m} no longer has access to ${ch}`],
  [/^El archivo de \*\*(.+)\*\* debe ser una imagen válida \(jpg, png, gif, webp\)$/, (_, lbl) =>
    `The **${lbl}** file must be a valid image (jpg, png, gif, webp)`],
  [/^La imagen de \*\*(.+)\*\* no puede superar los 8MB$/, (_, lbl) => `The **${lbl}** image cannot exceed 8MB`],
  [/^No (pudo|pude|puedes|puedo) (.+) al dueño del servidor$/, (_, __, act) => `I cannot ${mapModAct(act)} the server owner`],
  [/^No (pudo|pude|puedes|puedo) (.+) a mí mismo$/, (_, __, act) => `I cannot ${mapModAct(act)} myself`],
  [/^No puedo (.+) alguien con igual o mayor rango que el mío$/, (_, act) => `I cannot ${mapModAct(act)} someone with an equal or higher role than mine`],
  [/^No puedes (.+) alguien con igual o mayor rango que el tuyo$/, (_, act) => `You cannot ${mapModAct(act)} someone with an equal or higher role than yours`],
  [/^Fuiste baneado de \*\*(.+)\*\*$/, (_, g) => `You were banned from **${g}**`],
  [/^Fuiste desbaneado de \*\*(.+)\*\*$/, (_, g) => `You were unbanned from **${g}**`],
  [/^Fuiste softbaneado de \*\*(.+)\*\*$/, (_, g) => `You were softbanned from **${g}**`],
  [/^Fuiste tempbaneado de \*\*(.+)\*\*$/, (_, g) => `You were tempbanned from **${g}**`],
  [/^Fuiste expulsado de \*\*(.+)\*\*$/, (_, g) => `You were kicked from **${g}**`],
  [/^Fuiste silenciado en \*\*(.+)\*\* por \*\*(.+)\*\*$/, (_, g, dur) => `You were muted in **${g}** for **${dur}**`],
  [/^Fuiste advertido en \*\*(.+)\*\*$/, (_, g) => `You were warned in **${g}**`],
  [/^Tu silencio en \*\*(.+)\*\* fue removido$/, (_, g) => `Your timeout in **${g}** has been removed`],
  [/^Razón: (.*)$/, (_, r) => `Reason: ${r === "Sin razón" ? "No reason" : r}`],
  [/^No encontré la advertencia con ID `([^`]+)`$/, (_, id) => `Could not find warning with ID \`${id}\``],
  [/^Advertencia `([^`]+)` de \*\*(.+)\*\* eliminada$/, (_, id, u) => `Warning \`${id}\` removed from **${u}**`],
  [/^(.+) no tiene advertencias$/, (_, u) => `${u} has no warnings`],
  [/^Se eliminaron \*\*(\d+)\*\* advertencias? de \*\*(.+)\*\*$/, (_, n, u) => `Cleared **${n}** warning${n === "1" ? "" : "s"} from **${u}**`],
  [/^Ya tienes (\d+) recordatorios pendientes, espera a que alguno se cumpla$/, (_, n) =>
    `You already have ${n} pending reminders, wait for one to trigger`],
  [/^\[Ir al mensaje\]\((.+)\)$/, (_, u) => `[Jump to message](${u})`],
  [/^Recordatorio de mensaje de \*\*(.+)\*\*$/, (_, u) => `Reminder about message from **${u}**`],
  [/^\*\*(.+)\*\* fue expulsado\.$/, (_, u) => `**${u}** was kicked.`],
  [/^Advertencia `([^`]+)` aplicada \(total: `(\d+)`\)\.$/, (_, id, n) => `Warning \`${id}\` issued (total: \`${n}\`).`],
  [/^Solo rol: (.+)$/, (_, v) => `Only role: ${v}`],
  [/^Rol excluido: (.+)$/, (_, v) => `Excluded role: ${v}`],
  [/^Usuario excluido: (.+)$/, (_, v) => `Excluded user: ${v}`],
  [/^enviando\.\.\. (\d+\/\d+)$/, (_, prog) => `sending... ${prog}`],
  [/^Enviados: \*\*(\d+)\*\*$/, (_, n) => `Sent: **${n}**`],
  [/^Fallidos: \*\*(\d+)\*\*$/, (_, n) => `Failed: **${n}**`],
  [/^hecho$/, () => "done"],
  [/^Ejemplo: (.+)$/, (_, rest) => `Example: ${rest}`],
  [/^Comando (.+)$/, (_, cmd) => `${cmd} Command`],
  [/^Nuevos comandos añadidos \((.+)\)$/, (_, v) => `New commands added (${v})`],
];

function mapModAct(act) {
  const s = String(act || "").trim().toLowerCase();
  if (s.includes("softbanear")) return "softban";
  if (s.includes("tempbanear")) return "tempban";
  if (s.includes("banear")) return "ban";
  if (s.includes("expulsar")) return "kick";
  if (s.includes("silenciar")) return "mute";
  if (s.includes("quitar el silencio")) return "unmute";
  if (s.includes("advertir")) return "warn";
  return "act on";
}

function lookupExactEn(str) {
  if (EXACT_ES_TO_EN[str]) return EXACT_ES_TO_EN[str];
  if (str.endsWith(".") && EXACT_ES_TO_EN[str.slice(0, -1)]) {
    return `${EXACT_ES_TO_EN[str.slice(0, -1)]}.`;
  }
  const ticked = str.match(/^`(.+)`$/);
  if (ticked) {
    const inner = ticked[1];
    if (EXACT_ES_TO_EN[inner]) return `\`${EXACT_ES_TO_EN[inner]}\``;
    const innerPat = applyPatterns(inner);
    if (innerPat !== inner) return `\`${innerPat}\``;
  }
  return null;
}

function applyPatterns(str) {
  for (const [re, replacer] of PATTERN_ES_TO_EN) {
    const m = str.match(re);
    if (m) return typeof replacer === "function" ? replacer(...m) : str.replace(re, replacer);
  }
  return str;
}

function translateUsageCode(line) {
  if (!/^`\.[a-z]+/i.test(line)) return line;
  return line
    .replace(/^`\.dm titulo,texto/, "`.dm title,text")
    .replace(/\/razonOpcional\//g, "/optionalReason/")
    .replace(/<pregunta>/g, "<question>")
    .replace(/\[razón\]/g, "[reason]")
    .replace(/<razón>/g, "<reason>")
    .replace(/<nuevo>/g, "<new>")
    .replace(/<texto>/g, "<text>")
    .replace(/\[idioma\]/g, "[language]")
    .replace(/\| adjunto>/g, "| attachment>")
    .replace(/<mensaje>/g, "<message>")
    .replace(/@usuario(\d*)/g, "@user$1")
    .replace(/<tiempo>/g, "<duration>")
    .replace(/\[cantidad\]/g, "[amount]")
    .replace(/<cantidad>/g, "<amount>")
    .replace(/#canal/g, "#channel")
    .replace(/\[campo\]/g, "[field]")
    .replace(/@rol/g, "@role")
    .replace(/<nombre>/g, "<name>")
    .replace(/\bopción(\d+)/g, "option$1")
    .replace(/\bop(\d+)\b/g, "opt$1")
    .replace(/<tema>/g, "<topic>")
    .replace(/\[situacion\]/g, "[situation]");
}

function translateSingleLine(line) {
  if (!line || typeof line !== "string") return line;
  const trimmed = line.trim();
  if (!trimmed) return line;

  const direct = lookupExactEn(trimmed);
  if (direct) return line.replace(trimmed, direct);

  // Heading: ### Text
  const hMatch = line.match(/^(\s*#{1,3}\s+)(.+)$/);
  if (hMatch) {
    return `${hMatch[1]}${translateSingleLine(hMatch[2])}`;
  }

  // Subtext: -# Text
  const subMatch = line.match(/^(\s*-#\s+)(.+)$/);
  if (subMatch) {
    return `${subMatch[1]}${translateSingleLine(subMatch[2])}`;
  }

  // V2Text field line: > **Key:** value
  const fldMatch = line.match(/^(\s*>\s*\*\*)([^:*]+)(:\*\*\s*)(.*)$/);
  if (fldMatch) {
    const trKey = translateSingleLine(fldMatch[2]);
    const trVal = fldMatch[4] ? translateSingleLine(fldMatch[4]) : fldMatch[4];
    return `${fldMatch[1]}${trKey}${fldMatch[3]}${trVal}`;
  }

  // Standalone bold line: **Header**
  const boldMatch = line.match(/^(\s*\*\*)([^*]+)(\*\*\s*)$/);
  if (boldMatch) {
    return `${boldMatch[1]}${translateSingleLine(boldMatch[2])}${boldMatch[3]}`;
  }

  // Blockquote line: > Text
  const quoteMatch = line.match(/^(\s*>\s+)(.+)$/);
  if (quoteMatch) {
    return `${quoteMatch[1]}${translateSingleLine(quoteMatch[2])}`;
  }

  // Usage code span in /help
  const usageFixed = translateUsageCode(trimmed);
  if (usageFixed !== trimmed) return line.replace(trimmed, usageFixed);

  const pat = applyPatterns(trimmed);
  if (pat !== trimmed) return line.replace(trimmed, pat);

  // Comma-separated badge list or "Personalizado, Avatar" list
  if (trimmed.includes(", ")) {
    const parts = trimmed.split(", ");
    const mapped = parts.map((p) => lookupExactEn(p) ?? p);
    if (mapped.some((m, i) => m !== parts[i])) return line.replace(trimmed, mapped.join(", "));
  }

  return line;
}

function translateText(text, lang = "en") {
  if (lang !== "en" || typeof text !== "string" || !text) return text;
  const direct = lookupExactEn(text);
  if (direct) return direct;
  if (!text.includes("\n")) return translateSingleLine(text);

  return text
    .split("\n")
    .map((line) => translateSingleLine(line))
    .join("\n");
}

function translateComponentNode(node, lang) {
  if (!node || typeof node !== "object") return node;
  const plain = typeof node.toJSON === "function" ? node.toJSON() : { ...node };

  if (typeof plain.content === "string") plain.content = translateText(plain.content, lang);
  if (typeof plain.label === "string") plain.label = translateText(plain.label, lang);
  if (typeof plain.placeholder === "string") plain.placeholder = translateText(plain.placeholder, lang);
  if (typeof plain.description === "string") plain.description = translateText(plain.description, lang);
  if (typeof plain.title === "string") plain.title = translateText(plain.title, lang);

  if (Array.isArray(plain.options)) {
    plain.options = plain.options.map((opt) => ({
      ...opt,
      ...(typeof opt?.label === "string" ? { label: translateText(opt.label, lang) } : {}),
      ...(typeof opt?.description === "string" ? { description: translateText(opt.description, lang) } : {}),
    }));
  }
  if (plain.accessory && typeof plain.accessory === "object") {
    plain.accessory = translateComponentNode(plain.accessory, lang);
  }
  if (plain.component && typeof plain.component === "object") {
    plain.component = translateComponentNode(plain.component, lang);
  }
  if (Array.isArray(plain.components)) {
    plain.components = plain.components.map((c) => translateComponentNode(c, lang));
  }
  if (Array.isArray(plain.items)) {
    plain.items = plain.items.map((it) =>
      it && typeof it === "object" && typeof it.description === "string"
        ? { ...it, description: translateText(it.description, lang) }
        : it
    );
  }

  return plain;
}

function translateEmbed(embed, lang = "en") {
  if (lang !== "en" || !embed) return embed;
  const { EmbedBuilder } = require("discord.js");
  const json = typeof embed.toJSON === "function" ? { ...embed.toJSON() } : { ...(embed.data ?? embed) };

  if (typeof json.title === "string") json.title = translateText(json.title, lang);
  if (typeof json.description === "string") json.description = translateText(json.description, lang);
  if (json.author?.name) json.author = { ...json.author, name: translateText(json.author.name, lang) };
  if (json.footer?.text) json.footer = { ...json.footer, text: translateText(json.footer.text, lang) };
  if (Array.isArray(json.fields)) {
    json.fields = json.fields.map((f) => ({
      ...f,
      name: typeof f.name === "string" ? translateText(f.name, lang) : f.name,
      value: typeof f.value === "string" ? translateText(f.value, lang) : f.value,
    }));
  }

  return new EmbedBuilder(json);
}

function translateModal(modal, lang = "en") {
  if (lang !== "en" || !modal) return modal;
  const { ModalBuilder } = require("discord.js");
  const json = typeof modal.toJSON === "function" ? { ...modal.toJSON() } : { ...modal };
  if (typeof json.title === "string") json.title = translateText(json.title, lang);
  if (Array.isArray(json.components)) {
    json.components = json.components.map((c) => translateComponentNode(c, lang));
  }
  try {
    return typeof modal.toJSON === "function" ? new ModalBuilder(json) : json;
  } catch {
    return json;
  }
}

function translatePayload(payload, lang = getCurrentLang()) {
  if (lang !== "en" || payload == null) return payload;
  if (typeof payload === "string") return translateText(payload, lang);
  if (typeof payload !== "object") return payload;
  if (typeof payload.toPayload === "function") return payload;

  const out = { ...payload };
  if (typeof out.content === "string") out.content = translateText(out.content, lang);
  if (Array.isArray(out.embeds)) out.embeds = out.embeds.map((e) => translateEmbed(e, lang));
  if (Array.isArray(out.components)) out.components = out.components.map((c) => translateComponentNode(c, lang));
  return out;
}

const INTERACTION_I18N_WRAPPED = Symbol.for("redbot.interactionI18nWrapped");

function wrapInteractionForLang(interaction, lang) {
  if (lang !== "en" || !interaction || typeof interaction !== "object" || interaction[INTERACTION_I18N_WRAPPED]) {
    return interaction;
  }
  interaction[INTERACTION_I18N_WRAPPED] = true;

  for (const method of ["reply", "update", "followUp", "editReply"]) {
    if (typeof interaction[method] === "function") {
      const orig = interaction[method].bind(interaction);
      interaction[method] = (payload, ...rest) => orig(translatePayload(payload, lang), ...rest);
    }
  }
  if (typeof interaction.showModal === "function") {
    const origShow = interaction.showModal.bind(interaction);
    interaction.showModal = (modal, ...rest) => origShow(translateModal(modal, lang), ...rest);
  }
  if (typeof interaction.awaitModalSubmit === "function") {
    const origAwait = interaction.awaitModalSubmit.bind(interaction);
    interaction.awaitModalSubmit = async (...args) => {
      const sub = await origAwait(...args);
      return wrapInteractionForLang(sub, lang);
    };
  }
  return interaction;
}

const V2_HOOKS_INSTALLED = Symbol.for("redbot.v2I18nHooksInstalled");

function installV2I18nHooks() {
  if (globalThis[V2_HOOKS_INSTALLED]) return;
  globalThis[V2_HOOKS_INSTALLED] = true;

  const { Gralonium, ComponentsV2Builder, V2View } = require("gralonium");

  if (typeof Gralonium?.prototype?.load === "function") {
    const origLoad = Gralonium.prototype.load;
    Gralonium.prototype.load = async function (...args) {
      const res = await origLoad.apply(this, args);
      if (String(args[0] ?? "").toLowerCase().includes("commands")) {
        require("./adapter").wrapPrefixedCommands?.();
      }
      return res;
    };
  }

  const origBuilderToPayload = ComponentsV2Builder.prototype.toPayload;
  ComponentsV2Builder.prototype.toPayload = function (options = {}) {
    const lang = this._i18nLang || getCurrentLang();
    const payload = origBuilderToPayload.call(this, options);
    return lang === "en" ? translatePayload(payload, lang) : payload;
  };

  const origViewToPayload = V2View.prototype.toPayload;
  V2View.prototype.toPayload = function (options = {}) {
    const cur = langStorage.getStore();
    if (!this._i18nLang && cur) this._i18nLang = cur;
    const lang = this._i18nLang || cur || "es";
    const payload = lang !== cur
      ? runWithLang(lang, () => origViewToPayload.call(this, options))
      : origViewToPayload.call(this, options);
    return lang === "en" ? translatePayload(payload, lang) : payload;
  };

  const origViewSend = V2View.prototype.send;
  V2View.prototype.send = function (target, sendOptions = {}) {
    const cur = langStorage.getStore();
    if (!this._i18nLang && cur) this._i18nLang = cur;
    const lang = this._i18nLang || cur || "es";
    if (lang !== cur) {
      return runWithLang(lang, () => origViewSend.call(this, target, sendOptions));
    }
    return origViewSend.call(this, target, sendOptions);
  };

  const origViewAttach = V2View.prototype.attach;
  V2View.prototype.attach = function (messageTarget, collectorOptions = {}) {
    const cur = langStorage.getStore();
    if (!this._i18nLang && cur) this._i18nLang = cur;
    const lang = this._i18nLang || cur || "es";
    if (lang !== "en") {
      return origViewAttach.call(this, messageTarget, collectorOptions);
    }

    const msg = messageTarget?.resource?.message ?? messageTarget?.message ?? messageTarget;
    const origCreate = msg?.createMessageComponentCollector;
    if (typeof origCreate !== "function") {
      return origViewAttach.call(this, messageTarget, collectorOptions);
    }

    msg.createMessageComponentCollector = function (...cArgs) {
      const collector = origCreate.apply(this, cArgs);
      if (collector && typeof collector.on === "function") {
        const origOn = collector.on.bind(collector);
        collector.on = function (ev, listener) {
          if (typeof listener !== "function") return origOn(ev, listener);
          return origOn(ev, function (...evArgs) {
            return runWithLang(lang, () => {
              if (ev === "collect" && evArgs[0]) wrapInteractionForLang(evArgs[0], lang);
              return listener.apply(this, evArgs);
            });
          });
        };
      }
      return collector;
    };

    try {
      return origViewAttach.call(this, messageTarget, collectorOptions);
    } finally {
      if (msg.createMessageComponentCollector !== origCreate) {
        delete msg.createMessageComponentCollector;
        if (msg.createMessageComponentCollector !== origCreate) {
          msg.createMessageComponentCollector = origCreate;
        }
      }
    }
  };
}

installV2I18nHooks();

module.exports = {
  STRINGS,
  normalizeLang,
  detectLocaleLang,
  t,
  getCurrentLang,
  runWithLang,
  translateText,
  translateComponentNode,
  translateEmbed,
  translateModal,
  translatePayload,
  wrapInteractionForLang,
  installV2I18nHooks,
};
