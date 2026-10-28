const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../src/config");
const { sendLog } = require("../../src/guild");
const { broadcastDm, buildDmAllEmbed, buildDmAllLogEmbed } = require("../../src/runtime");

const intervals = new Map();

async function rotarIcono(guild) {
  if (!guild.client.guilds.cache.has(guild.id)) {
    clearInterval(intervals.get(guild.id));
    intervals.delete(guild.id);
    return;
  }

  const emojis = [...guild.emojis.cache.filter((e) => !e.animated).values()];
  if (!emojis.length) return;

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  const url = emoji.imageURL({ size: 256, extension: "png" });

  await guild.setBanner(url).catch(() => null);
}

const adminCommand = {
  data: new CommandBuilder({
    name: "comandointervalosupersecretokjj",
    description: "rota foto con emoji 15min",
    as_prefix: true,
    as_slash: false,
  }),
  params: new ParamsBuilder(),
  async code(ctx) {
    if (!ctx.member?.permissions.has("Administrator")) {
      return ctx.send("No tienes permisos para usar este comando, necesitas: `Administrator`");
    }

    const guild = ctx.guild;
    if (!guild) return ctx.send("Este comando solo se puede usar en servidores");

    const emojis = guild.emojis.cache.filter((e) => !e.animated);
    if (!emojis.size) return ctx.send("no emoji?");

    if (intervals.has(guild.id)) {
      clearInterval(intervals.get(guild.id));
      intervals.delete(guild.id);
      return ctx.send("fin");
    }

    await rotarIcono(guild);

    const id = setInterval(() => rotarIcono(guild), 15 * 60 * 1000);
    intervals.set(guild.id, id);

    return ctx.send(`go\ndisponibles: **${emojis.size}**\n`);
  },
};

function parseDmAllArgs(raw) {
  let str = raw;
  let soloId = null;
  let rolId = null;
  let userId = null;
  let imagen = null;

  const soloMatch = str.match(/--solo\s+(?:<@&)?(\d+)>?/);
  const rolMatch = str.match(/--rol\s+(?:<@&)?(\d+)>?/);
  const userMatch = str.match(/--user\s+(?:<@!?)?(\d+)>?/);
  const imagenMatch = str.match(/--imagen\s+(https?:\/\/\S+)/);

  if (soloMatch) { soloId = soloMatch[1]; str = str.replace(soloMatch[0], "").trim(); }
  if (rolMatch) { rolId = rolMatch[1]; str = str.replace(rolMatch[0], "").trim(); }
  if (userMatch) { userId = userMatch[1]; str = str.replace(userMatch[0], "").trim(); }
  if (imagenMatch) { imagen = imagenMatch[1]; str = str.replace(imagenMatch[0], "").trim(); }

  const sep = str.indexOf(",");
  const titulo = sep !== -1 ? str.slice(0, sep).trim() : str.trim();
  const texto = sep !== -1 ? str.slice(sep + 1).trim() : "";

  return { titulo, texto, soloId, rolId, userId, imagen };
}

const DMALL_PARAMERROR = (bot) => ({
  embeds: [
    new EmbedBuilder()
      .setAuthor({ name: "Comando DM All", iconURL: bot.displayAvatarURL() })
      .setDescription(
        `**Usos:**\nEnvía un embed por DM a todos los miembros del servidor` +
        `\n\n**Aliases:**\n\`dmall\`, \`dmeveryone\`` +
        `\n\`\`\`\n` +
        `.dm titulo,texto [--solo <@rol>] [--rol <@rol>] [--user <@user>] [--imagen <url>]\n` +
        `\n` +
        `Ejemplo base:\n` +
        `  .dm Hoy jugamos,go ofi\n` +
        `\n` +
        `Con imagen:\n` +
        `  .dm Hoy jugamos,miren esto --imagen https://i.imgur.com/abc.png\n` +
        `\n` +
        `Solo un rol:\n` +
        `  .dm Hoy jugamos,solo los gokianos --solo @gokianos\n` +
        `\n` +
        `Excluir rol:\n` +
        `  .dm Hoy jugamos,menos los malos --rol @malos\n` +
        `\n` +
        `Excluir usuario:\n` +
        `  .dm Hoy jugamos,todos menos el mamon --user @loge\n` +
        `\n` +
        `Todo:\n` +
        `  .dm Hoy jugamos,solo gokianos sin malos ni mamones --solo @gokianos --rol @malos --user @loge --imagen https://i.imgur.com/abc.png` +
        `\`\`\``
      )
      .setColor(RED),
  ],
});

const dmallCommand = {
  data: new CommandBuilder({
    name: "dmall",
    description: "Envía un DM con embed a todos los miembros del servidor",
    aliases: ["dm", "dmeveryone", "dmerveryone"],
    as_prefix: true,
    as_slash: false,
  }),
  async code(ctx) {
    const bot = ctx.bot.user;
    const raw = ctx.args?.join(" ").trim();
    if (!ctx.member?.permissions.has("Administrator")) {
      return ctx.send("No tienes permisos para usar este comando, necesitas: `Administrator`");
    }

    const guild = ctx.guild;
    if (!guild) return ctx.send("Este comando solo se puede usar en servidores");
    if (!raw) return ctx.send(DMALL_PARAMERROR(bot));

    const { titulo, texto, soloId, rolId, userId, imagen: imagenUrl } = parseDmAllArgs(raw);
    if (!titulo || !texto) return ctx.send(DMALL_PARAMERROR(bot));

    const author = ctx.author;
    const imagen = imagenUrl ?? ctx.message.attachments.first()?.url ?? null;
    const embed = buildDmAllEmbed({ titulo, texto, author, guild, imagenUrl: imagen });

    let progressMsg = null;
    const result = await broadcastDm({
      guild,
      embed,
      soloRolId: soloId,
      excluirRolId: rolId,
      excluirUserId: userId,
      onProgress: async (done, total) => {
        const text = `enviando... ${done}/${total}`;
        if (!progressMsg) progressMsg = await ctx.send(text);
        else await progressMsg.edit(text).catch(() => null);
      },
    });

    if (!result) return ctx.send("Ya hay un DM masivo en curso en este servidor, espera a que termine");

    const { enviados, fallidos } = result;
    const exclusiones = [
      soloId ? `Solo rol: \`${soloId}\`` : null,
      rolId ? `Rol excluido: \`${rolId}\`` : null,
      userId ? `Usuario excluido: \`${userId}\`` : null,
    ].filter(Boolean);

    await sendLog(guild, buildDmAllLogEmbed({ author, enviados, fallidos, titulo, texto, filtros: exclusiones })).catch(() => null);

    return (progressMsg ? progressMsg.edit.bind(progressMsg) : ctx.send)(`hecho\nEnviados: **${enviados}**\nFallidos: **${fallidos}**`).catch(() => null);
  },
};

function buildPrefixedCommand({ name, description, aliases = [], authorName, descriptionText, noMention = false }) {
  return {
    data: new CommandBuilder({
      name,
      description,
      aliases,
      as_prefix: true,
      as_slash: false,
    }),
    async code(ctx) {
      if (!authorName || !descriptionText) return;
      const botUser = ctx.bot?.user ?? ctx.client?.user;
      const embed = new EmbedBuilder()
        .setAuthor({ name: authorName, iconURL: botUser?.displayAvatarURL ? botUser.displayAvatarURL() : undefined })
        .setDescription(descriptionText)
        .setColor(RED);

      return ctx.send({
        embeds: [embed],
        ...(noMention ? { allowedMentions: { repliedUser: false } } : {}),
      });
    },
  };
}

const DEFINITIONS = [
  { name: "clone", description: "Clona un canal con su configuración", aliases: ["chclone", "channelclone", "clonechannel", "clonar", "duplicar"] },
  { name: "deny", description: "Quita el acceso a un usuario en un canal", aliases: ["chdeny", "channeldeny", "block", "denegar"], authorName: "Comando Deny", descriptionText: "**Usos:**\nQuita el acceso a un usuario en un canal\n\n**Aliases:**\n`chdeny`, `channeldeny`\n\n```js\n.deny <@usuario> [#canal]\nEjemplo: .deny @loge #uxiono```" },
  { name: "hide", description: "Oculta un canal a @everyone", aliases: ["chhide", "hidechannel", "channelhide", "ocultar", "esconder"] },
  { name: "channelinfo", description: "Muestra información de un canal", aliases: ["chinfo", "cinfo"] },
  { name: "lock", description: "Bloquea un canal para usuarios normales", aliases: ["chlock", "lockdown", "channellock", "cerrar"] },
  { name: "nuke", description: "Recrea el canal borrando todos sus mensajes", aliases: ["chnuke", "channelnuke", "vaciar"] },
  { name: "permit", description: "Da acceso a un usuario en un canal", aliases: ["chpermit", "channelpermit", "allow", "acceso"], authorName: "Comando Permit", descriptionText: "**Usos:**\nDa acceso a un usuario en un canal\n\n**Aliases:**\n`chpermit`, `channelpermit`\n\n```js\n.permit <@usuario> [#canal]\nEjemplo: .permit @loge #uxiono```" },
  { name: "rename", description: "Renombra un canal", aliases: ["chrename", "channelrename", "crename", "chanrename"], authorName: "Comando Rename", descriptionText: "**Usos:**\nRenombra un canal\n\n**Aliases:**\n`chrename`, `channelrename`\n\n```js\n.rename [#canal] <nuevo>\nEjemplo: .rename #uxiono padalustro```" },
  { name: "slowmode", description: "Establece el slowmode de un canal (0 para desactivar, máx 6h)", aliases: ["sm", "chslowmode", "channelslowmode", "lento"], authorName: "Comando Slowmode", descriptionText: "**Usos:**\nEstablece un slowmode para el canal\n\n**Aliases:**\n`sm`, `chslowmode`, `channelslowmode`\n\n```js\n.slowmode <tiempo> [#canal]\nEjemplo: .slowmode 1h #uxiono```" },
  { name: "unlock", description: "Abre un canal bloqueado", aliases: ["chunlock", "channelunlock", "cunlock", "abrir", "desbloquear"] },
  { name: "critica", description: "Te doy una crítica despiadada de algo", aliases: ["criticar", "criticize"], authorName: "Comando Critica", descriptionText: "**Usos:**\nGenera una crítica despiadada de algo\n\n**Aliases:**\n`criticar`, `criticize`\n\n```js\n.critica <tema>\nEjemplo: .critica la chochoinflación```" },
  { name: "excusa", description: "Genera una excusa ridícula pero creativa", aliases: ["coartada", "excuse"], authorName: "Comando Excusa", descriptionText: "**Usos:**\nGenera una excusa ridícula pero creativa\n\n**Aliases:**\n`coartada`, `excuse`\n\n```js\n.excusa [situacion]\nEjemplo: .excusa llegué tarde```" },
  { name: "lol", description: "Responde con un emoji random", aliases: [] },
  { name: "opinion", description: "Pide mi opinión sin filtro sobre algo", aliases: ["op", "opina"], authorName: "Comando Opinion", descriptionText: "**Usos:**\nPide mi opinión sin filtro sobre algo\n\n**Aliases:**\n`op`, `opina`\n\n```js\n.opinion <tema>\nEjemplo: .opinion la chochoinflación```" },
  { name: "roast", description: "Critica despiadadamente a un usuario", aliases: ["quemar", "burn"] },
  { name: "teoria", description: "Una teoría conspirativa sobre cualquier cosa", aliases: ["conspira", "conspiracion", "theory"], authorName: "Comando Teoria", descriptionText: "**Usos:**\nGenera una teoría conspirativa sobre cualquier cosa\n\n**Aliases:**\n`conspira`, `conspiracion`, `theory`\n\n```js\n.teoria <tema>\nEjemplo: .teoria las palomas son drones```" },
  { name: "ban", description: "Banea a un usuario del servidor", aliases: ["modban"], authorName: "Comando Ban", descriptionText: "**Usos:**\nBanea a un usuario del servidor\n\n**Aliases:**\n`modban`\n\n```js\n.ban <@usuario> /razonOpcional/\nEjemplo: .ban @loge chau```" },
  { name: "clearwarns", description: "Borra todas las advertencias de un usuario", aliases: ["warnsclear", "clearwarn", "cwarns", "resetwarns"], authorName: "Comando Clearwarns", descriptionText: "**Usos:**\nBorra las advertencias de un usuario\n\n**Aliases:**\n`warnsclear`, `clearwarn`\n\n```js\n.clearwarns <@usuario>\nEjemplo: .clearwarns @loge```" },
  { name: "kick", description: "Expulsa a un usuario del servidor", aliases: ["modkick", "expulsar"], authorName: "Comando Kick", descriptionText: "**Usos:**\nExpulsa a un usuario del servidor\n\n**Aliases:**\n`modkick`, `expulsar`\n\n```js\n.kick <@usuario> /razonOpcional/\nEjemplo: .kick @loge chau```" },
  { name: "massban", description: "Banea a múltiples usuarios a la vez (hasta 5 menciones o IDs)", aliases: ["modmassban", "mban", "mb"], authorName: "Comando Massban", descriptionText: "**Usos:**\nBanea a múltiples usuarios a la vez (hasta 5)\n\n**Aliases:**\n`modmassban`, `mban`\n\n```js\n.massban <@usuario1> <@usuario2> ... /razonOpcional/\nEjemplo: .massban @loge @otro chau```" },
  { name: "mute", description: "Silencia a un usuario", aliases: ["modmute", "timeout", "silenciar"], authorName: "Comando Mute", descriptionText: "**Usos:**\nSilencia a un usuario del servidor\n\n**Aliases:**\n`modmute`, `timeout`, `silenciar`\n\n```js\n.mute <@usuario> <tiempo> [razón]\nEjemplo: .mute @loge 30m shhh```" },
  { name: "purge", description: "Elimina mensajes del canal", aliases: ["modpurge", "clear", "prune", "limpiar"], authorName: "Comando Purge", descriptionText: "**Usos:**\nElimina mensajes del canal\n\n**Aliases:**\n`modpurge`, `clear`, `prune`\n\n```js\n.purge <cantidad> [@usuario]\nEjemplo: .purge 10 @carzo```" },
  { name: "removelogs", description: "Desactiva los logs de RedBot en el servidor", aliases: ["modremovelogs", "removelog", "unsetlogs", "dellogs", "nologs"] },
  { name: "removewarn", description: "Elimina una advertencia por su ID", aliases: ["delwarn", "warnremove", "rwarn"], authorName: "Comando Removewarn", descriptionText: "**Usos:**\nElimina una advertencia por su ID\n\n**Aliases:**\n`delwarn`, `warnremove`\n\n```js\n.removewarn <ID>\nEjemplo: .removewarn 3lp3p3```" },
  { name: "setlogs", description: "Establece el canal de logs para RedBot en el servidor", aliases: ["modsetlogs", "logchannel", "setlog", "logs"], authorName: "Comando Setlogs", descriptionText: "**Usos:**\nEstablece el canal de logs para RedBot en el servidor\n\n**Aliases:**\n`modsetlogs`, `logchannel`, `setlog`\n\n```js\n.setlogs <#canal>\nEjemplo: .setlogs #uxiono```" },
  { name: "softban", description: "Expulsa a un usuario borrando sus mensajes (ban + unban inmediato)", aliases: ["modsoftban", "sban", "sb"], authorName: "Comando Softban", descriptionText: "**Usos:**\nExpulsa a un usuario del servidor borrando sus mensajes\n\n**Aliases:**\n`modsoftban`, `sban`\n\n```js\n.softban <@usuario> /razonOpcional/\nEjemplo: .softban @loge chau```" },
  { name: "tempban", description: "Banea a un usuario temporalmente", aliases: ["modtempban", "tban", "tb"], authorName: "Comando Tempban", descriptionText: "**Usos:**\nBanea a un usuario temporalmente\n\n**Aliases:**\n`modtempban`, `tban`\n\n```js\n.tempban <@usuario> <tiempo> /razonOpcional/\nEjemplo: .tempban @loge 10d chau```" },
  { name: "unban", description: "Desbanea a un usuario por su ID", aliases: ["modunban", "desbanear"], authorName: "Comando Unban", descriptionText: "**Usos:**\nDesbanea a un usuario por su ID\n\n**Aliases:**\n`modunban`, `desbanear`\n\n```js\n.unban <ID> [razón]\nEjemplo: .unban 1020772849906098186 hola```" },
  { name: "unmute", description: "Quita el timeout a un usuario", aliases: ["modunmute", "untimeout", "desmutear"], authorName: "Comando Unmute", descriptionText: "**Usos:**\nQuita el mute a un usuario\n\n**Aliases:**\n`modunmute`, `untimeout`\n\n```js\n.unmute <@usuario> [razón]\nEjemplo: .unmute @loge hola```" },
  { name: "warn", description: "Advierte a un usuario", aliases: ["modwarn", "advertir"], authorName: "Comando Warn", descriptionText: "**Usos:**\nAdvierte a un usuario\n\n**Aliases:**\n`modwarn`, `advertir`\n\n```js\n.warn <@usuario> <razón>\nEjemplo: .warn @loge lol```" },
  { name: "warnings", description: "Muestra las advertencias de un usuario", aliases: ["warns", "modwarnings", "infracciones"], authorName: "Comando Warnings", descriptionText: "**Usos:**\nMuestra las advertencias de un usuario\n\n**Aliases:**\n`warns`, `modwarnings`\n\n```js\n.warnings <@usuario>\nEjemplo: .warnings @loge```" },
  { name: "roleadd", description: "Añade un rol a un usuario", aliases: ["addrole", "radd"], authorName: "Comando Roleadd", descriptionText: "**Usos:**\nAñade un rol a un usuario\n\n**Aliases:**\n`addrole`, `radd`\n\n```js\n.roleadd <@usuario> <@rol>\nEjemplo: .roleadd @loge @gokiano```" },
  { name: "roleall", description: "Añade un rol a todos los miembros del servidor", aliases: ["allrole", "rall"], authorName: "Comando Roleall", descriptionText: "**Usos:**\nAñade un rol a todos los miembros\n\n**Aliases:**\n`allrole`\n\n```js\n.roleall <@rol> [bots]\nEjemplo: .roleall @miembro\nEjemplo con bots: .roleall @miembro bots```" },
  { name: "rolebots", description: "Añade o quita un rol a todos los bots", aliases: ["botsrole"], authorName: "Comando Rolebots", descriptionText: "**Usos:**\nAñade o quita un rol a todos los bots\n\n**Aliases:**\n`botsrole`\n\n```js\n.rolebots <@rol> <add|remove>\nEjemplo: .rolebots @bots add```" },
  { name: "color", description: "Muestra el color de un rol", aliases: ["colorrole", "rolecolor", "rcolor", "rolcolor"], authorName: "Comando Color", descriptionText: "**Usos:**\nMuestra el color de un rol\n\n**Aliases:**\n`colorrole`, `rolecolor`\n\n```js\n.color <@rol>\nEjemplo: .color @gokiano```" },
  { name: "rolehoist", description: "Activa o desactiva si un rol se muestra separado en la lista de miembros", aliases: ["hoistrole", "rhoist"], authorName: "Comando Rolehoist", descriptionText: "**Usos:**\nActiva o desactiva si un rol se muestra separado en la lista de miembros\n\n**Aliases:**\n`hoistrole`, `rhoist`\n\n```js\n.rolehoist <@rol>\nEjemplo: .rolehoist @gokiano```" },
  { name: "rolehumans", description: "Añade o quita un rol a todos los usuarios (sin bots)", aliases: ["humansrole"], authorName: "Comando Rolehumans", descriptionText: "**Usos:**\nAñade o quita un rol a todos los usuarios\n\n**Aliases:**\n`humansrole`\n\n```js\n.rolehumans <@rol> <add|remove>\nEjemplo: .rolehumans @miembro add```" },
  { name: "roleicon", description: "Muestra el icono de un rol", aliases: ["iconrole", "ricon"], authorName: "Comando Roleicon", descriptionText: "**Usos:**\nMuestra el icono de un rol\n\n**Aliases:**\n`iconrole`, `ricon`\n\n```js\n.roleicon <@rol>\nEjemplo: .roleicon @gokiano```" },
  { name: "role", description: "Muestra información de un rol", aliases: ["roleinfo", "inforole", "ri"], authorName: "Comando Roleinfo", descriptionText: "**Usos:**\nMuestra información de un rol\n\n**Aliases:**\n`roleinfo`, `inforole`\n\n```js\n.roleinfo <@rol>\nEjemplo: .roleinfo @gokiano```" },
  { name: "rolejoin", description: "Configura o desactiva el rol automático al entrar", aliases: ["joinrole", "autorole"], authorName: "Comando Rolejoin", descriptionText: "**Usos:**\nConfigura o desactiva el rol automático al entrar\n\n**Aliases:**\n`joinrole`, `autorole`\n\n```js\n.rolejoin <@rol>   → activar\n.rolejoin          → desactivar```" },
  { name: "rolementionable", description: "Activa o desactiva si un rol es mencionable por todos", aliases: ["rolemention", "mentionrole", "rmention"], authorName: "Comando Rolementionable", descriptionText: "**Usos:**\nActiva o desactiva si el rol es mencionable por todos\n\n**Aliases:**\n`rolemention`, `mentionrole`, `rmention`\n\n```js\n.rolementionable <@rol>\nEjemplo: .rolementionable @gokiano```" },
  { name: "roleperms", description: "Muestra permisos de un rol", aliases: ["rperms"] },
  { name: "roleremove", description: "Quita un rol a un usuario", aliases: ["removerole", "rremove", "delrole"], authorName: "Comando Roleremove", descriptionText: "**Usos:**\nQuita un rol a un usuario\n\n**Aliases:**\n`removerole`, `rremove`\n\n```js\n.roleremove <@usuario> <@rol>\nEjemplo: .roleremove @loge @gokiano```" },
  { name: "roleremoveall", description: "Quita un rol a todos los miembros que lo tengan", aliases: ["removeroleall", "removeallrole", "rremoveall"], authorName: "Comando Roleremoveall", descriptionText: "**Usos:**\nQuita un rol a todos los miembros que lo tengan\n\n**Aliases:**\n`removeroleall`, `removeallrole`\n\n```js\n.roleremoveall <@rol> [bots]\nEjemplo: .roleremoveall @miembro```" },
  { name: "rolerename", description: "Renombra un rol", aliases: ["renamerole", "rrename"], authorName: "Comando Rolerename", descriptionText: "**Usos:**\nRenombra un rol\n\n**Aliases:**\n`renamerole`, `rrename`\n\n```js\n.rolerename <@rol> <nuevoNombre>\nEjemplo: .rolerename @gokiano potatiano```" },
  { name: "roleusers", description: "Lista usuarios con un rol", aliases: ["rusers", "usersrole", "rwho"], authorName: "Comando Roleusers", descriptionText: "**Usos:**\nLista de usuarios con un rol\n\n**Aliases:**\n`rusers`, `usersrole`\n\n```js\n.roleusers <@rol>\nEjemplo: .roleusers @gokiano```" },
  { name: "serverbanner", description: "Muestra el banner del servidor", aliases: ["sbanner"] },
  { name: "emojis", description: "Muestra todos los emojis del servidor", aliases: ["serveremojis", "emoji"] },
  { name: "server", description: "Muestra información del servidor", aliases: ["sv", "serverinfo", "si"] },
  { name: "logo", description: "Muestra el logo del servidor", aliases: ["serverlogo", "servericon", "icon"] },
  { name: "roles", description: "Lista los roles del servidor", aliases: ["serverroles", "sroles", "listroles"], authorName: "Comando Roles", descriptionText: "**Usos:**\nLista los roles del servidor\n\n**Aliases:**\n`serverroles`, `sroles`\n\n```js\n.roles\nEjemplo: .roles```" },
  { name: "avatar", description: "Muestra el avatar de un usuario", aliases: ["av", "useravatar", "pfp"] },
  { name: "ubanner", description: "Muestra el banner de un usuario", aliases: ["userbanner", "banner", "ub"], authorName: "Comando Ubanner", descriptionText: "**Usos:**\nMuestra el banner de un usuario\n\n**Aliases:**\n`userbanner`\n\n```js\n.ubanner [@usuario]\nEjemplo: .ubanner @carzo```" },
  { name: "user", description: "Muestra información de un usuario", aliases: ["userinfo", "ui", "whois"] },
  { name: "userperms", description: "Muestra los permisos de un usuario en el servidor", aliases: ["perms", "permissions", "uperms", "up"] },
  { name: "uroles", description: "Muestra los roles de un usuario", aliases: ["userroles", "ur"] },
  { name: "askreset", description: "Limpia tu historial de conversación con la IA", aliases: ["reset", "aireset"] },
  { name: "botinfo", description: "Información general del bot", aliases: ["bot", "info"] },
  { name: "describe", description: "Describe el contenido de una imagen", aliases: ["describir"], authorName: "Comando Describe", descriptionText: "**Usos:**\nDescribe el contenido de una imagen\n\n**Aliases:**\n`describir`\n\n```js\n.describe <adjunto>\nEjemplo: .describe <Subeunaimagenwe.png> ```" },
  { name: "invite", description: "Obtén los links de invitación del bot", aliases: ["inv"] },
  { name: "ping", description: "Muestra la latencia del bot", aliases: [] },
  { name: "resume", description: "Resume un texto largo", aliases: ["resumir", "summarize"], authorName: "Comando Resume", descriptionText: "**Usos:**\nResume un texto de 100 caracteres o más\n\n**Aliases:**\n`resumir`, `summarize`\n\n```js\n.resume <texto>\nEjemplo: .resume en terminos de reproducción entre hombres humanos y Pokémon hembras, Vaporeon es el...```" },
  { name: "setprefix", description: "Cambia o muestra el prefix del bot en este servidor", aliases: ["prefix"] },
  { name: "transcribe", description: "Transcribe un audio o video a texto", aliases: ["transcribir"], authorName: "Comando Transcribe", descriptionText: "**Usos:**\nTranscribe un audio o video a texto\n\n**Aliases:**\n`transcribir`\n\n```js\n.transcribe <url | adjunto>\nEjemplo: .transcribe https://ejemplo.com/audio.mp3```" },
  { name: "translate", description: "Traduce texto a otro idioma", aliases: ["traducir", "trans"], authorName: "Comando Translate", descriptionText: "**Usos:**\nTraduce texto a cualquier idioma\n\n**Aliases:**\n`traducir`, `trans`\n\n```js\n.translate <texto> [idioma]\nEjemplo: .translate כלב español```", noMention: true },
];

module.exports = {
  data: [adminCommand, ...DEFINITIONS.map(buildPrefixedCommand), dmallCommand],
};
