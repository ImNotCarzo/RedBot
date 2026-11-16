const {
  CommandBuilder,
  ComponentsV2Builder,
  MessageFlags,
  V2Text,
  V2View,
} = require("gralonium");
const { getId, RED, USER_APP_CONFIG } = require("../../src/config");
const { getPrefix, resolveContextLang } = require("../../src/guild");
const { Logger, handleCommandError, INVITE_URL, SUPPORT_URL } = require("../../src/runtime");
const log = new Logger("CMD_HELP", process.env.LOG_LEVEL);

const IDS = {
  ai:        () => getId("ai"),
  util:      () => getId("util"),
  user:      () => getId("user"),
  mod:       () => getId("mod"),
  server:    () => getId("server"),
  role:      () => getId("role"),
  channel:   () => getId("channel"),
  tickets:   () => getId("tickets"),
  auto:      () => getId("auto"),
  feeds:     () => getId("feeds"),
  community: () => getId("community"),
};

// ─────────────────────────────────────────────
//  CATEGORÍAS
// ─────────────────────────────────────────────

const CATEGORIES = [
  "utilidad",
  "ai",
  "moderacion",
  "servidor",
  "usuario",
  "roles",
  "canal",
  "tickets",
  "automatizacion",
  "comunidad",
];

const CATEGORY_LABELS = {
  utilidad:       "Utilidad",
  ai:             "IA",
  moderacion:     "Moderación",
  servidor:       "Servidor",
  usuario:        "Usuario",
  roles:          "Roles",
  canal:          "Canal",
  tickets:        "Tickets",
  automatizacion: "Auto",
  comunidad:      "Comunidad",
};

// ─────────────────────────────────────────────
//  COMANDOS
// ─────────────────────────────────────────────

const getBaseCommands = () => ({
  ai: {
    ask:        { short: "ask",        slash: "ai ask",        id: IDS.ai(), usage: ".ask <pregunta>",            aliases: ["ai", "ia"],          description: "Hazle una pregunta o envíale una imagen a la IA." },
    askreset:   { short: "askreset",   slash: "ai askreset",   id: IDS.ai(), usage: ".askreset",                  aliases: ["aireset", "reset"],  description: "Limpia tu historial de conversación con la IA." },
    transcribe: { short: "transcribe", slash: "ai transcribe", id: IDS.ai(), usage: ".transcribe <url | adjunto>",aliases: ["transcribir"],       description: "Transcribe un audio o video a texto." },
    describe:   { short: "describe",   slash: "ai describe",   id: IDS.ai(), usage: ".describe <url | adjunto>",  aliases: ["describir"],         description: "Describe el contenido de una imagen." },
    resume:     { short: "resume",     slash: "ai resume",     id: IDS.ai(), usage: ".resume <texto>",            aliases: ["resumir", "summarize"], description: "Resume un texto largo de 100 caracteres o más." },
    ocr:        { short: "ocr",        slash: "ai ocr",        id: IDS.ai(), usage: ".ocr <url | adjunto>",       aliases: ["leer", "extraer"],   description: "Extrae el texto de una imagen." },
    opinion:    { short: "opinion",    slash: "ai opinion",    id: IDS.ai(), usage: ".opinion <tema>",            aliases: ["op", "opina"],       description: "Pide mi opinión sin filtro sobre algo." },
    critica:    { short: "critica",    slash: "ai critica",    id: IDS.ai(), usage: ".critica <tema>",            aliases: ["criticar"],          description: "Te doy una crítica despiadada de algo." },
    excusa:     { short: "excusa",     slash: "ai excusa",     id: IDS.ai(), usage: ".excusa [situacion]",        aliases: ["coartada"],          description: "Genera una excusa ridícula pero creativa." },
    teoria:     { short: "teoria",     slash: "ai teoria",     id: IDS.ai(), usage: ".teoria <tema>",             aliases: ["conspira"],          description: "Una teoría conspirativa sobre cualquier cosa." },
    roast:      { short: "roast",      slash: "ai roast",      id: IDS.ai(), usage: ".roast [@usuario]",          aliases: ["burn"],              description: "Critica despiadadamente a un usuario." },
  },
  utilidad: {
    afk:       { short: "afk",       slash: "util afk",       id: IDS.util(), usage: ".afk [razón]",               aliases: ["ausente"],                     description: "Establece tu estado como ausente (AFK)." },
    jumbo:     { short: "jumbo",     slash: "util jumbo",     id: IDS.util(), usage: ".jumbo <emoji>",             aliases: ["emojijumbo", "bigemoji"],      description: "Muestra un emoji en tamaño grande." },
    ping:      { short: "ping",      slash: "util ping",      id: IDS.util(), usage: ".ping",                      aliases: [],                              description: "Muestra la latencia actual del bot." },
    botinfo:   { short: "botinfo",   slash: "util botinfo",   id: IDS.util(), usage: ".botinfo",                   aliases: ["bot", "info"],                 description: "Muestra información general del bot." },
    invite:    { short: "invite",    slash: "util invite",    id: IDS.util(), usage: ".invite",                    aliases: ["inv"],                         description: "Envía la invitación del bot y el servidor de soporte." },
    setprefix: { short: "setprefix", slash: "util setprefix", id: IDS.util(), usage: ".setprefix <nuevo>",         aliases: ["prefix"],                      description: "Cambia o muestra el prefijo del bot en este servidor." },
    translate: { short: "translate", slash: "util translate", id: IDS.util(), usage: ".translate <texto> [idioma]",aliases: ["traducir", "trans"],           description: "Traduce texto a otro idioma." },
    download:  { short: "download",  slash: "util download",  id: IDS.util(), usage: ".download <url>",            aliases: ["dl", "video", "bajar"],        description: "Descarga un video desde un enlace." },
    dm:        { short: "dmall",     slash: "util dm",        id: IDS.util(), usage: ".dmall <mensaje>",           aliases: ["dm"],                          description: "Envía un mensaje privado a miembros del servidor." },
    choose:    { short: "choose",    slash: "util choose",    id: IDS.util(), usage: ".choose <op1, op2, ...>",    aliases: ["elegir", "escoger", "pick"],   description: "Elige una opción al azar entre varias." },
    lol:       { short: "lol",       slash: "util lol",       id: IDS.util(), usage: ".lol",                       aliases: [],                              description: "Ríete de algo así bien jaja." },
  },
  usuario: {
    info:        { short: "user",       slash: "user info",        id: IDS.user(), usage: ".user [@usuario]",      aliases: ["userinfo", "ui", "whois"],    description: "Muestra información general de un usuario." },
    avatar:      { short: "avatar",     slash: "user avatar",      id: IDS.user(), usage: ".avatar [@usuario]",    aliases: ["av", "pfp"],                  description: "Muestra el avatar de un usuario." },
    banner:      { short: "banner",     slash: "user banner",      id: IDS.user(), usage: ".banner [@usuario]",    aliases: ["userbanner", "ub"],           description: "Muestra el banner de un usuario." },
    roles:       { short: "uroles",     slash: "user roles",       id: IDS.user(), usage: ".uroles [@usuario]",    aliases: ["userroles", "ur"],            description: "Muestra los roles de un usuario." },
    permissions: { short: "perms",      slash: "user permissions", id: IDS.user(), usage: ".perms [@usuario]",     aliases: ["userperms", "up"],            description: "Muestra los permisos de un usuario en el servidor." },
    random:      { short: "randomuser", slash: "user random",      id: IDS.user(), usage: ".randomuser [@rol]",    aliases: ["urandom", "userrandom", "ruser"], description: "Elige a un miembro del servidor al azar." },
  },
  moderacion: {
    ban:        { short: "ban",        slash: "mod ban",        id: IDS.mod(), usage: ".ban <@usuario> [razón]",            aliases: [],                          description: "Banea a un usuario del servidor." },
    unban:      { short: "unban",      slash: "mod unban",      id: IDS.mod(), usage: ".unban <id> [razón]",                aliases: [],                          description: "Desbanea a un usuario por ID." },
    softban:    { short: "softban",    slash: "mod softban",    id: IDS.mod(), usage: ".softban <@usuario> [razón]",        aliases: ["sb"],                      description: "Banea y desbanea al instante para borrar mensajes recientes." },
    tempban:    { short: "tempban",    slash: "mod tempban",    id: IDS.mod(), usage: ".tempban <@usuario> <tiempo> [razón]",aliases: ["tb"],                     description: "Banea a un usuario por un tiempo determinado." },
    massban:    { short: "massban",    slash: "mod massban",    id: IDS.mod(), usage: ".massban <@u1> [@u2] ... [razón]",   aliases: ["mb"],                      description: "Banea hasta 5 usuarios seleccionados." },
    kick:       { short: "kick",       slash: "mod kick",       id: IDS.mod(), usage: ".kick <@usuario> [razón]",           aliases: [],                          description: "Expulsa a un usuario del servidor." },
    mute:       { short: "mute",       slash: "mod mute",       id: IDS.mod(), usage: ".mute <@usuario> <tiempo> [razón]",  aliases: ["timeout", "silenciar"],    description: "Silencia a un usuario con timeout." },
    unmute:     { short: "unmute",     slash: "mod unmute",     id: IDS.mod(), usage: ".unmute <@usuario> [razón]",         aliases: ["untimeout", "desmutear"],  description: "Quita el timeout a un usuario." },
    purge:      { short: "purge",      slash: "mod purge",      id: IDS.mod(), usage: ".purge <cantidad> [@usuario]",       aliases: ["clear", "limpiar"],        description: "Elimina mensajes del canal." },
    warn:       { short: "warn",       slash: "mod warn",       id: IDS.mod(), usage: ".warn <@usuario> <razón>",           aliases: ["advertir"],                description: "Advierte a un usuario." },
    removewarn: { short: "removewarn", slash: "mod removewarn", id: IDS.mod(), usage: ".removewarn <warnID>",               aliases: ["rwarn", "delwarn"],        description: "Elimina una advertencia por su ID." },
    clearwarns: { short: "clearwarns", slash: "mod clearwarns", id: IDS.mod(), usage: ".clearwarns <@usuario>",             aliases: ["cwarns", "resetwarns"],    description: "Borra todas las advertencias de un usuario." },
    warnings:   { short: "warnings",   slash: "mod warnings",   id: IDS.mod(), usage: ".warnings <@usuario>",               aliases: ["warns", "infracciones"],   description: "Ver advertencias de un usuario." },
    setlogs:      { short: "setlogs",      slash: "mod setlogs",      id: IDS.mod(), usage: ".setlogs <#canal>", aliases: ["logs"], description: "Establece el canal de logs para RedBot." },
    removelogs:   { short: "removelogs",   slash: "mod removelogs",   id: IDS.mod(), usage: ".removelogs",       aliases: ["dellogs", "nologs"], description: "Desactiva los logs de RedBot en el servidor." },
    automod:      { short: null,           slash: "mod automod",      id: IDS.mod(), usage: "/mod automod",      aliases: [], description: "Configura el filtro automático ampliado y respuestas custom." },
    dramawatcher: { short: null,           slash: "mod dramawatcher", id: IDS.mod(), usage: "/mod dramawatcher", aliases: [], description: "Canal de alertas con sanciones por botones o emojis." },
  },
  servidor: {
    info:        { short: "server",      slash: "server info",        id: IDS.server(), usage: ".server",  aliases: ["sv", "serverinfo", "si"], description: "Muestra información general del servidor." },
    logo:        { short: "logo",        slash: "server logo",        id: IDS.server(), usage: ".logo",    aliases: ["icon", "servericon"],     description: "Muestra el logo del servidor." },
    banner:      { short: "sbanner",     slash: "server banner",      id: IDS.server(), usage: ".sbanner", aliases: ["serverbanner"],           description: "Muestra el banner del servidor." },
    emojis:      { short: "emojis",      slash: "server emojis",      id: IDS.server(), usage: ".emojis",  aliases: ["serveremojis", "emoji"],   description: "Muestra todos los emojis del servidor." },
    roles:       { short: "sroles",      slash: "server roles",       id: IDS.server(), usage: ".sroles",  aliases: ["serverroles", "listroles"], description: "Lista los roles del servidor." },
    custombot:   { short: "custombot",   slash: "server custombot",   id: IDS.server(), usage: ".custombot", aliases: ["botprofile", "cbot"],     description: "Personaliza avatar, banner, apodo y biografía del bot en el servidor." },
    customreset: { short: "customreset", slash: "server customreset", id: IDS.server(), usage: ".customreset [campo]", aliases: ["botreset", "creset"], description: "Restablece el perfil personalizado del bot en el servidor." },
    setup:       { short: "setup",       slash: "server setup",       id: IDS.server(), usage: ".setup",   aliases: ["config", "panel"],          description: "Panel interactivo de configuración del servidor." },
  },
  roles: {
    info:        { short: "role",    slash: "role info",        id: IDS.role(), usage: ".role <@rol>",             aliases: ["roleinfo", "ri"],              description: "Muestra información de un rol." },
    icon:        { short: "ricon",   slash: "role icon",        id: IDS.role(), usage: ".ricon <@rol>",            aliases: ["roleicon"],                    description: "Muestra el icono de un rol." },
    color:       { short: "rcolor",  slash: "role color",       id: IDS.role(), usage: ".rcolor <@rol>",           aliases: ["rolecolor", "rolcolor"],       description: "Muestra el color de un rol." },
    users:       { short: "rusers",  slash: "role users",       id: IDS.role(), usage: ".rusers <@rol>",           aliases: ["roleusers", "rwho"],           description: "Lista usuarios con un rol." },
    add:         { short: "radd",    slash: "role add",         id: IDS.role(), usage: ".radd <@usuario> <@rol>",  aliases: ["roleadd", "addrole"],          description: "Añade un rol a un usuario." },
    remove:      { short: "rremove", slash: "role remove",      id: IDS.role(), usage: ".rremove <@usuario> <@rol>",aliases: ["roleremove", "delrole"],      description: "Quita un rol a un usuario." },
    rename:      { short: "rrename", slash: "role rename",      id: IDS.role(), usage: ".rrename <@rol> <nombre>", aliases: ["renamerole"],                  description: "Renombra un rol." },
    hoist:       { short: "rhoist",  slash: "role hoist",       id: IDS.role(), usage: ".rhoist <@rol>",           aliases: ["rolehoist"],                   description: "Activa o desactiva si un rol se muestra separado." },
    mentionable: { short: "rmention",slash: "role mentionable", id: IDS.role(), usage: ".rmention <@rol>",         aliases: ["rolemention"],                 description: "Activa o desactiva si un rol es mencionable." },
    all:         { short: "roleall", slash: "role all",         id: IDS.role(), usage: ".roleall <@rol> [bots]",   aliases: ["allrole"],                     description: "Añade un rol a todos los miembros." },
    removeall:   { short: "roleremoveall", slash: "role removeall", id: IDS.role(), usage: ".roleremoveall <@rol>",aliases: ["removeroleall"],               description: "Quita un rol a todos los miembros que lo tengan." },
    bots:        { short: "rolebots",slash: "role bots",        id: IDS.role(), usage: ".rolebots <@rol> <add|remove>", aliases: ["botsrole"],               description: "Añade o quita un rol a todos los bots." },
    humans:      { short: "rolehumans", slash: "role humans",   id: IDS.role(), usage: ".rolehumans <@rol> <add|remove>", aliases: ["humansrole"],            description: "Añade o quita un rol a todos los usuarios." },
    join:        { short: "rolejoin",slash: "role join",        id: IDS.role(), usage: ".rolejoin <@rol>",          aliases: ["joinrole", "autorole"],        description: "Configura o desactiva el rol automático al entrar." },
    permissions: { short: "roleperms", slash: "role permissions", id: IDS.role(), usage: ".roleperms <@rol>",     aliases: ["rperms"],                       description: "Muestra los permisos de un rol." },
    reaction:    { short: null,        slash: "role reaction",    id: IDS.role(), usage: "/role reaction",        aliases: [], description: "Paneles de roles por reacción o botón (normales y temporales)." },
    voicelink:   { short: null,        slash: "role voicelink",   id: IDS.role(), usage: "/role voicelink",       aliases: [], description: "Asigna un rol automáticamente al entrar a un canal de voz." },
    temprole:    { short: null,        slash: "role temprole",    id: IDS.role(), usage: "/role temprole",        aliases: [], description: "Asigna un rol temporal con expiración automática." },
  },
  canal: {
    info:      { short: "cinfo",  slash: "channel info",     id: IDS.channel(), usage: ".cinfo [#canal]",            aliases: ["chinfo", "channelinfo"],   description: "Muestra información de un canal." },
    rename:    { short: "crename",slash: "channel rename",   id: IDS.channel(), usage: ".crename <#canal> <nombre>", aliases: ["chrename", "chanrename"],  description: "Renombra un canal." },
    lock:      { short: "lock",   slash: "channel lock",     id: IDS.channel(), usage: ".lock [#canal]",             aliases: ["lockdown", "cerrar"],      description: "Bloquea un canal para usuarios normales." },
    unlock:    { short: "unlock", slash: "channel unlock",   id: IDS.channel(), usage: ".unlock [#canal]",           aliases: ["abrir", "desbloquear"],    description: "Abre un canal bloqueado." },
    slowmode:  { short: "sm",     slash: "channel slowmode", id: IDS.channel(), usage: ".sm <tiempo> [#canal]",      aliases: ["slowmode", "lento"],       description: "Establece el slowmode de un canal." },
    nuke:      { short: "nuke",   slash: "channel nuke",     id: IDS.channel(), usage: ".nuke [#canal]",             aliases: ["vaciar"],                  description: "Recrea el canal borrando todos sus mensajes." },
    clone:     { short: "clone",  slash: "channel clone",    id: IDS.channel(), usage: ".clone [#canal]",            aliases: ["clonar", "duplicar"],      description: "Clona un canal con su configuración." },
    permit:    { short: "permit", slash: "channel permit",   id: IDS.channel(), usage: ".permit <@usuario> [#canal]",aliases: ["allow", "acceso"],         description: "Da acceso a un usuario en un canal." },
    deny:      { short: "deny",   slash: "channel deny",     id: IDS.channel(), usage: ".deny <@usuario> [#canal]",  aliases: ["block", "denegar"],        description: "Quita el acceso a un usuario en un canal." },
    hide:      { short: "hide",   slash: "channel hide",     id: IDS.channel(), usage: ".hide [#canal]",             aliases: ["ocultar", "esconder"],     description: "Oculta un canal a @everyone." },
    snipe:     { short: "snipe",  slash: "channel snipe",    id: IDS.channel(), usage: ".snipe [indice]",            aliases: ["borrado"],                 description: "Recupera mensajes eliminados recientemente (hasta 100 por canal)." },
    autopurge: { short: null,     slash: "channel autopurge",id: IDS.channel(), usage: "/channel autopurge",         aliases: [],                          description: "Elimina mensajes automáticamente tras un tiempo límite." },
    sticky:    { short: null,     slash: "channel sticky",   id: IDS.channel(), usage: "/channel sticky",            aliases: [],                          description: "Fija un mensaje anclado al final del canal." },
    temp:      { short: null,     slash: "channel temp",     id: IDS.channel(), usage: "/channel temp",              aliases: [],                          description: "Crea canales temporales o un Voice Hub Join-to-Create." },
    voicelink: { short: null,     slash: "channel voicelink",id: IDS.channel(), usage: "/channel voicelink",         aliases: [],                          description: "Vincula un canal de voz a un canal de texto privado." },
  },
  tickets: {
    setup:      { short: null,     slash: "tickets setup",      id: IDS.tickets(), usage: "/tickets setup",      aliases: [],        description: "Configura categoría, rol soporte y canal de transcripciones." },
    panel:      { short: null,     slash: "tickets panel",      id: IDS.tickets(), usage: "/tickets panel",      aliases: [],        description: "Publica un panel interactivo para abrir tickets." },
    create:     { short: "ticket", slash: "tickets create",     id: IDS.tickets(), usage: ".ticket [motivo]",    aliases: ["nuevo"], description: "Abre un ticket de soporte." },
    close:      { short: null,     slash: "tickets close",      id: IDS.tickets(), usage: "/tickets close",      aliases: [],        description: "Cierra el ticket y exporta transcripción .html/.txt." },
    add:        { short: null,     slash: "tickets add",        id: IDS.tickets(), usage: "/tickets add",        aliases: [],        description: "Añade a un usuario al ticket actual." },
    remove:     { short: null,     slash: "tickets remove",     id: IDS.tickets(), usage: "/tickets remove",     aliases: [],        description: "Quita a un usuario del ticket actual." },
    claim:      { short: null,     slash: "tickets claim",      id: IDS.tickets(), usage: "/tickets claim",      aliases: [],        description: "Reclama el ticket como miembro del equipo." },
    transcript: { short: null,     slash: "tickets transcript", id: IDS.tickets(), usage: "/tickets transcript", aliases: [],        description: "Exporta el historial completo (.html y .txt) del ticket." },
  },
  automatizacion: {
    cmdadd:      { short: null, slash: "auto cmdadd",      id: IDS.auto(),  usage: "/auto cmdadd",      aliases: [], description: "Crea hasta 500 comandos personalizados con TagScript." },
    cmdremove:   { short: null, slash: "auto cmdremove",   id: IDS.auto(),  usage: "/auto cmdremove",   aliases: [], description: "Elimina un comando personalizado." },
    cmdlist:     { short: null, slash: "auto cmdlist",     id: IDS.auto(),  usage: "/auto cmdlist",     aliases: [], description: "Lista los comandos personalizados." },
    embedadd:    { short: null, slash: "auto embedadd",    id: IDS.auto(),  usage: "/auto embedadd",    aliases: [], description: "Guarda hasta 500 plantillas de tipo Embed." },
    embedview:   { short: null, slash: "auto embedview",   id: IDS.auto(),  usage: "/auto embedview",   aliases: [], description: "Previsualiza o envía una plantilla Embed." },
    embedremove: { short: null, slash: "auto embedremove", id: IDS.auto(),  usage: "/auto embedremove", aliases: [], description: "Elimina una plantilla Embed." },
    embedlist:   { short: null, slash: "auto embedlist",   id: IDS.auto(),  usage: "/auto embedlist",   aliases: [], description: "Lista las plantillas Embed guardadas." },
    timeradd:    { short: null, slash: "auto timeradd",    id: IDS.auto(),  usage: "/auto timeradd",    aliases: [], description: "Crea hasta 100 mensajes recurrentes." },
    timerremove: { short: null, slash: "auto timerremove", id: IDS.auto(),  usage: "/auto timerremove", aliases: [], description: "Elimina un mensaje recurrente." },
    timerlist:   { short: null, slash: "auto timerlist",   id: IDS.auto(),  usage: "/auto timerlist",   aliases: [], description: "Lista los mensajes recurrentes." },
    ruleadd:     { short: null, slash: "auto ruleadd",     id: IDS.auto(),  usage: "/auto ruleadd",     aliases: [], description: "Crea hasta 50 reglas lógicas de automatización." },
    ruleremove:  { short: null, slash: "auto ruleremove",  id: IDS.auto(),  usage: "/auto ruleremove",  aliases: [], description: "Elimina una regla de automatización." },
    rulelist:    { short: null, slash: "auto rulelist",    id: IDS.auto(),  usage: "/auto rulelist",    aliases: [], description: "Lista las reglas de automatización." },
    feeds_add:   { short: null, slash: "feeds add",        id: IDS.feeds(), usage: "/feeds add",        aliases: [], description: "Alertas de YouTube, Twitch, Kick, TikTok y Reddit." },
    feeds_list:  { short: null, slash: "feeds list",       id: IDS.feeds(), usage: "/feeds list",       aliases: [], description: "Lista las alertas sociales activas." },
  },
  comunidad: {
    welcome:           { short: null,      slash: "community welcome",           id: IDS.community(), usage: "/community welcome",           aliases: [],               description: "Configura el canal y plantilla de bienvenidas." },
    goodbye:           { short: null,      slash: "community goodbye",           id: IDS.community(), usage: "/community goodbye",           aliases: [],               description: "Configura un canal y embed separado de despedidas." },
    birthday:          { short: null,      slash: "community birthday",          id: IDS.community(), usage: "/community birthday",          aliases: [],               description: "Registra o borra tu fecha de cumpleaños." },
    birthdays:         { short: null,      slash: "community birthdays",         id: IDS.community(), usage: "/community birthdays",         aliases: [],               description: "Lista los cumpleaños del servidor." },
    birthdaysetup:     { short: null,      slash: "community birthdaysetup",     id: IDS.community(), usage: "/community birthdaysetup",     aliases: [],               description: "Configura anuncios automáticos de cumpleaños." },
    invites:           { short: "invites", slash: "community invites",           id: IDS.community(), usage: ".invites [@usuario]",          aliases: ["invitaciones"], description: "Consulta las invitaciones de un miembro." },
    inviteleaderboard: { short: null,      slash: "community inviteleaderboard", id: IDS.community(), usage: "/community inviteleaderboard", aliases: [],               description: "Ranking de usuarios con más invitaciones." },
    inviteadd:         { short: null,      slash: "community inviteadd",         id: IDS.community(), usage: "/community inviteadd",         aliases: [],               description: "Ajusta invitaciones bonus de un usuario." },
    invitereward:      { short: null,      slash: "community invitereward",      id: IDS.community(), usage: "/community invitereward",      aliases: [],               description: "Configura roles de recompensa por invitaciones." },
  },
});

const getCommands = () => {
  const commands = getBaseCommands();
  commands.utilidad.poll      = { short: "poll",      slash: "util poll",      id: IDS.util(),    usage: ".poll <pregunta> / <op1> / <op2>", aliases: ["encuesta"],                            description: "Crea una encuesta nativa de Discord." };
  commands.utilidad.remind    = { short: "remind",    slash: "util remind",    id: IDS.util(),    usage: ".remind <tiempo> <texto>",         aliases: ["recordar", "recordatorio", "reminder"], description: "Te recuerda algo por mensaje privado." };
  commands.utilidad.reminders = { short: "reminders", slash: "util reminders", id: IDS.util(),    usage: ".reminders",                       aliases: ["recordatorios", "myreminders"],         description: "Lista o cancela tus recordatorios activos." };
  commands.utilidad.setlang   = { short: "setlang",   slash: "util setlang",   id: IDS.util(),    usage: ".setlang [es|en]",                 aliases: ["lang", "idioma"],                       description: "Cambia o muestra el idioma del servidor o personal." };
  commands.canal.recap        = { short: "recap",     slash: "channel recap",  id: IDS.channel(), usage: ".recap [cantidad]",                aliases: ["resumen", "tldr"],                      description: "Resume los últimos mensajes del canal." };
  return commands;
};

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;
const SEP = "||";

const formatSelectLabel = (cmd) =>
  cmd.slash.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// ─────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────

const data = {
  data: new CommandBuilder({
    name: "help",
    description: "Lista interactiva de comandos disponibles",
    as_prefix: true,
    as_slash: true,
    ...USER_APP_CONFIG,
  }),

  async code(ctx) {
    try {
      await ctx.defer();
      const isSlash  = Boolean(ctx.interaction);
      const authorId = ctx.user?.id;
      const prefix   = ctx.guild?.id ? await getPrefix(ctx.guild.id) : ".";
      const COMMANDS = getCommands();

      const formatCommand = (cmd) => {
        if (isSlash) return `</${cmd.slash}:${cmd.id}>`;
        return cmd.short ? `${prefix}${cmd.short}` : `</${cmd.slash}:${cmd.id}>`;
      };

      const buildCommandList = (category) =>
        Object.values(COMMANDS[category]).map(formatCommand).join("\n");

      const ensureAuthor = async (interaction) => {
        if (!authorId || interaction.user.id === authorId) return true;
        await interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral }).catch(() => {});
        return false;
      };

      const helpView = new V2View({
        authorId,
        timeout: COLLECTOR_TIMEOUT,
        thirdPartyMode: "allow",
        onEnd: "static",
        state: { category: "utilidad" },
        render: ({ state, view }) => {
          const category = state.category;
          return new ComponentsV2Builder()
            .addText("### <:redbot:1474109778044260478> RedBot")
            .addButtonsRow(
              CATEGORIES.map((cat) => ({
                label: CATEGORY_LABELS[cat],
                customId: view.id("cat", cat),
                style: cat === category ? "danger" : "secondary",
              })),
              { autoWrap: true }
            )
            .addSeparator("small")
            .addText(buildCommandList(category))
            .addSeparator("small")
            .addSelectMenu({
              customId: view.id("select", category),
              placeholder: "Selecciona un comando",
              options: Object.entries(COMMANDS[category]).map(([key, cmd]) => ({
                label: formatSelectLabel(cmd),
                value: `${category}${SEP}${key}`,
                description: cmd.description.slice(0, 100),
              })),
            })
            .addSeparator("small")
            .addButtonsRow([
              { label: "Invitar", style: "link", url: INVITE_URL },
              { label: "Soporte", style: "link", url: SUPPORT_URL },
            ])
            .outside()
            .addButton({ label: "✖", customId: view.id("del"), style: "secondary" })
            .inside();
        },
        renderStatic: ({ state }) =>
          new ComponentsV2Builder()
            .addText("### <:redbot:1474109778044260478> RedBot")
            .addSeparator("small")
            .addText(buildCommandList(state.category)),
        actions: {
          cat: async ({ parts, interaction, setState }) => {
            if (!(await ensureAuthor(interaction))) return false;
            const category = parts[0];
            if (!COMMANDS[category]) return false;
            setState({ category });
          },
          del: async ({ interaction, view }) => {
            if (!(await ensureAuthor(interaction))) return false;
            view.stop("deleted");
            await interaction.message?.delete?.().catch(() => {});
            return false;
          },
          select: async ({ values, interaction }) => {
            const selected = values[0] ?? "";
            const sepIdx   = selected.indexOf(SEP);
            const category = sepIdx >= 0 ? selected.slice(0, sepIdx) : "";
            const key      = sepIdx >= 0 ? selected.slice(sepIdx + SEP.length) : "";
            const cmd      = COMMANDS[category]?.[key];

            if (!cmd) {
              await interaction.reply({ content: "No encontré ese comando", flags: MessageFlags.Ephemeral }).catch(() => {});
              return false;
            }

            const usoValue = isSlash
              ? `</${cmd.slash}:${cmd.id}>`
              : cmd.short ? V2Text.code(cmd.usage) : `</${cmd.slash}:${cmd.id}>`;

            const detailCard = ComponentsV2Builder.card({
              title: formatSelectLabel(cmd),
              fields: [
                ["Uso", usoValue],
                ["Descripción", cmd.description],
                cmd.aliases.length
                  ? ["Alias", cmd.aliases.map((a) => V2Text.code(`${prefix}${a}`)).join(", ")]
                  : null,
              ],
              fieldsSeparator: false,
              color: RED,
            });

            await interaction.reply(detailCard.toPayload({ ephemeral: true })).catch(() => {});
            return false;
          },
        },
      });

      await helpView.send(ctx, { allowedMentions: { repliedUser: false } });
    } catch (err) {
      log.error("[help]", { err: err?.message ?? String(err) });
      handleCommandError(ctx, err);
    }
  },
};

module.exports = { data, getCommands, CATEGORIES, CATEGORY_LABELS };
