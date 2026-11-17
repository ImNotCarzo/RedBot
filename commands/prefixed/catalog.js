const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../src/config");
const { sendLog } = require("../../src/guild");
const { broadcastDm, buildDmAllEmbed, buildDmAllLogEmbed } = require("../../src/runtime");

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
        `\n\n\`\`\`js\n` +
        `.dm titulo,texto [--solo <@rol>] [--rol <@rol>] [--user <@user>] [--imagen <url>]\n` +
        `\n` +
        `# Básico\n` +
        `  .dm Hoy jugamos,go ofi\n` +
        `\n` +
        `# Con imagen por URL o adjunto\n` +
        `  .dm Hoy jugamos,miren esto --imagen https://i.imgur.com/abc.png\n` +
        `\n` +
        `# Solo a un rol\n` +
        `  .dm Hoy jugamos,solo los gokianos --solo @gokianos\n` +
        `\n` +
        `# Excluir un rol\n` +
        `  .dm Hoy jugamos,menos los malos --rol @malos\n` +
        `\n` +
        `# Excluir un usuario\n` +
        `  .dm Hoy jugamos,todos menos el mamon --user @loge\n` +
        `\n` +
        `# Todo combinado\n` +
        `  .dm Hoy jugamos,solo gokianos sin malos ni mamones --solo @gokianos --rol @malos --user @loge --imagen https://i.imgur.com/abc.png` +
        `\`\`\``
      )
      .setColor(RED),
  ],
  allowedMentions: { repliedUser: false },
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

    if (imagenUrl) {
      let validImgUrl = false;
      try {
        const parsedImg = new URL(imagenUrl);
        validImgUrl = parsedImg.protocol === "https:" || parsedImg.protocol === "http:";
      } catch {}
      if (!validImgUrl) {
        return ctx.send("La URL de `--imagen` debe ser un enlace válido (`https://...`)");
      }
    }

    const firstAtt = ctx.message.attachments.first();
    if (!imagenUrl && firstAtt) {
      const ct = firstAtt.contentType ?? "";
      const attName = firstAtt.name ?? "";
      const isImg = /^image\/(jpeg|png|gif|webp)/i.test(ct) || /\.(png|jpe?g|gif|webp)$/i.test(attName);
      if (!isImg || (firstAtt.size ?? 0) > 8 * 1024 * 1024) {
        return ctx.send("La imagen adjunta debe ser jpg, png, gif o webp de máximo 8MB");
      }
    }

    const author = ctx.author;
    const imagen = imagenUrl ?? firstAtt?.url ?? null;
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
  { name: "choose", description: "Elige una opción al azar entre varias", aliases: ["elegir", "escoger", "pick"], authorName: "Comando Choose", descriptionText: "**Usos:**\nElige una opción al azar entre varias\n\n**Aliases:**\n`elegir`, `escoger`, `pick`\n\n```js\n.choose <opción1, opción2, ...>\nEjemplo: .choose pizza, hamburguesa, tacos```" },
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
  { name: "custombot", description: "Personaliza el perfil del bot en el servidor", aliases: ["botprofile", "cbot"], authorName: "Comando Custombot", descriptionText: "**Usos:**\nPersonaliza el avatar, banner, apodo o biografía del bot en este servidor\n\n**Aliases:**\n`botprofile`, `cbot`\n\n```js\n.custombot            → abre el menú interactivo\n.custombot <apodo>    → cambia el apodo directamente```" },
  { name: "customreset", description: "Restablece el perfil del bot en el servidor", aliases: ["botreset", "creset"], authorName: "Comando Customreset", descriptionText: "**Usos:**\nRestablece avatar, banner, biografía o apodo del bot al perfil global\n\n**Aliases:**\n`botreset`, `creset`\n\n```js\n.customreset [todo|avatar|banner|biografia|apodo]\nEjemplo: .customreset banner```" },
  { name: "avatar", description: "Muestra el avatar de un usuario", aliases: ["av", "useravatar", "pfp"] },
  { name: "ubanner", description: "Muestra el banner de un usuario", aliases: ["userbanner", "banner", "ub"], authorName: "Comando Ubanner", descriptionText: "**Usos:**\nMuestra el banner de un usuario\n\n**Aliases:**\n`userbanner`\n\n```js\n.ubanner [@usuario]\nEjemplo: .ubanner @carzo```" },
  { name: "user", description: "Muestra información de un usuario", aliases: ["userinfo", "ui", "whois"] },
  { name: "userperms", description: "Muestra los permisos de un usuario en el servidor", aliases: ["perms", "permissions", "uperms", "up"] },
  { name: "uroles", description: "Muestra los roles de un usuario", aliases: ["userroles", "ur"] },
  { name: "randomuser", description: "Elige a un miembro del servidor al azar", aliases: ["urandom", "userrandom", "ruser"] },
  { name: "afk", description: "Establece tu estado como ausente (AFK)", aliases: ["ausente"] },
  { name: "ask", description: "Consulta o conversa con la IA", aliases: ["ia", "ai"], authorName: "Comando Ask", descriptionText: "**Usos:**\nHazle una pregunta a la IA (puedes adjuntar una imagen opcional)\n\n**Aliases:**\n`ia`, `ai`\n\n```js\n.ask <pregunta>\nEjemplo: .ask cuando te apagan```" },
  { name: "askreset", description: "Limpia tu historial de conversación con la IA", aliases: ["reset", "aireset"] },
  { name: "botinfo", description: "Información general del bot", aliases: ["bot", "info"] },
  { name: "download", description: "Descarga un video desde un enlace", aliases: ["dl", "video", "bajar"], authorName: "Comando Download", descriptionText: "**Usos:**\nDescarga un video desde un enlace (TikTok, X, Instagram, Reddit, etc.)\n\n**Aliases:**\n`dl`, `video`, `bajar`\n\n```js\n.download <url>\nEjemplo: .download https://www.tiktok.com/@user/video/123```" },
  { name: "describe", description: "Describe el contenido de una imagen", aliases: ["describir"], authorName: "Comando Describe", descriptionText: "**Usos:**\nDescribe el contenido de una imagen\n\n**Aliases:**\n`describir`\n\n```js\n.describe <adjunto>\nEjemplo: .describe <Subeunaimagenwe.png> ```" },
  { name: "invite", description: "Obtén los links de invitación del bot", aliases: ["inv"] },
  { name: "jumbo", description: "Muestra un emoji en tamaño grande", aliases: ["emojijumbo", "bigemoji"], authorName: "Comando Jumbo", descriptionText: "**Usos:**\nMuestra un emoji personalizado o estándar en tamaño grande\n\n**Aliases:**\n`emojijumbo`, `bigemoji`\n\n```js\n.jumbo <emoji>\nEjemplo: .jumbo <:redbot:1474109778044260478>```" },
  { name: "ocr", description: "Extrae el texto visible de una imagen (OCR)", aliases: ["leer", "extraer"], authorName: "Comando OCR", descriptionText: "**Usos:**\nExtrae todo el texto legible de una imagen adjunta, enlace o respuesta\n\n**Aliases:**\n`leer`, `extraer`\n\n```js\n.ocr <imagen o URL>\nEjemplo: .ocr <adjunto>```" },
  { name: "ping", description: "Muestra la latencia del bot", aliases: [] },
  { name: "poll", description: "Crea una encuesta nativa de Discord", aliases: ["encuesta"], authorName: "Comando Poll", descriptionText: "**Usos:**\nCrea una encuesta nativa separando la pregunta y las opciones con `/`\n\n**Aliases:**\n`encuesta`\n\n```js\n.poll <pregunta> / <op1> / <op2> [--horas N] [--multi]\nEjemplo: .poll ¿Pizza o tacos? / Pizza / Tacos```" },
  { name: "remind", description: "Programa un recordatorio personal", aliases: ["recordar", "recordatorio", "reminder"], authorName: "Comando Remind", descriptionText: "**Usos:**\nPrograma un recordatorio personal por mensaje privado\n\n**Aliases:**\n`recordar`, `recordatorio`\n\n```js\n.remind <tiempo> <texto>\nEjemplo: .remind 30m Revisar el servidor```" },
  { name: "resume", description: "Resume un texto largo", aliases: ["resumir", "summarize"], authorName: "Comando Resume", descriptionText: "**Usos:**\nResume un texto de 100 caracteres o más\n\n**Aliases:**\n`resumir`, `summarize`\n\n```js\n.resume <texto>\nEjemplo: .resume en terminos de reproducción entre hombres humanos y Pokémon hembras, Vaporeon es el...```" },
  { name: "setprefix", description: "Cambia o muestra el prefix del bot en este servidor", aliases: ["prefix"] },
  { name: "transcribe", description: "Transcribe un audio o video a texto", aliases: ["transcribir"], authorName: "Comando Transcribe", descriptionText: "**Usos:**\nTranscribe un audio o video a texto\n\n**Aliases:**\n`transcribir`\n\n```js\n.transcribe <url | adjunto>\nEjemplo: .transcribe https://ejemplo.com/audio.mp3```" },
  { name: "translate", description: "Traduce texto a otro idioma", aliases: ["traducir", "trans"], authorName: "Comando Translate", descriptionText: "**Usos:**\nTraduce texto a cualquier idioma\n\n**Aliases:**\n`traducir`, `trans`\n\n```js\n.translate <texto> [idioma]\nEjemplo: .translate כלב español```", noMention: true },
  { name: "recap", description: "Resume los últimos mensajes del canal", aliases: ["resumen", "tldr"], authorName: "Comando Recap", descriptionText: "**Usos:**\nResume la conversación reciente del canal (10 a 100 mensajes)\n\n**Aliases:**\n`resumen`, `tldr`\n\n```js\n.recap [cantidad]\nEjemplo: .recap 50```" },
  { name: "setup", description: "Panel interactivo de configuración del servidor", aliases: ["config", "panel"] },
  { name: "snipe", description: "Muestra el último mensaje borrado recientemente en el canal", aliases: ["borrado"] },
  { name: "reminders", description: "Lista o cancela tus recordatorios activos", aliases: ["recordatorios", "myreminders"] },
  { name: "setlang", description: "Cambia o consulta el idioma del bot en el servidor", aliases: ["lang", "idioma"] },
  { name: "ticket", description: "Abre un ticket de soporte", aliases: ["nuevo"] },
  { name: "invites", description: "Consulta las invitaciones de un usuario", aliases: ["invitaciones"] },
  { name: "automod", description: "Configura el filtro automático ampliado y respuestas personalizadas", aliases: ["am"] },
  { name: "dramawatcher", description: "Configura el canal de Drama Watcher para moderar con botones y emojis", aliases: ["drama", "dw"] },
  {
    name: "reactionrole",
    description: "Paneles de roles por reacción o botón (normales, únicos o temporales)",
    aliases: ["rr", "reactionroles", "rpanel"],
    authorName: "Comando Reactionrole",
    descriptionText: "**Usos:**\nGestiona paneles de roles por reacción o botón\n\n**Aliases:**\n`rr`, `reactionroles`, `rpanel`\n\n```js\n.reactionrole create <panel> [normal|unique|verify|temp] [duracion]\n.reactionrole add <panel> <@rol> [emoji] [--etiqueta texto]\n.reactionrole remove <panel> <@rol>\n.reactionrole send <panel> [#canal]\n.reactionrole list | delete <panel>```",
  },
  {
    name: "voicerole",
    description: "Asigna y quita un rol automáticamente al entrar o salir de voz",
    aliases: ["vrole", "vr"],
    authorName: "Comando Voicerole",
    descriptionText: "**Usos:**\nVincula un rol a canales de voz\n\n**Aliases:**\n`vrole`, `vr`\n\n```js\n.voicerole add <@rol> [#voz]\n.voicerole remove <@rol> [#voz]\n.voicerole list```",
  },
  {
    name: "temprole",
    description: "Asigna un rol temporal a un usuario que se quita solo al expirar",
    aliases: ["trole"],
    authorName: "Comando Temprole",
    descriptionText: "**Usos:**\nAsigna un rol temporal con expiración automática\n\n**Aliases:**\n`trole`\n\n```js\n.temprole <@usuario> <@rol> <duracion>\nEjemplo: .temprole @loge @VIP 2h```",
  },
  {
    name: "autopurge",
    description: "Elimina mensajes automáticamente tras un tiempo límite en un canal",
    aliases: ["ap"],
    authorName: "Comando Autopurge",
    descriptionText: "**Usos:**\nConfigura limpieza automática de mensajes en un canal\n\n**Aliases:**\n`ap`\n\n```js\n.autopurge set <tiempo> [#canal] [all|bots|humans]\n.autopurge remove [#canal]\n.autopurge list\nEjemplo: .autopurge set 5m #general```",
  },
  {
    name: "sticky",
    description: "Fija un mensaje anclado que siempre reaparece al final del canal",
    aliases: ["stickymessage", "fijar"],
    authorName: "Comando Sticky",
    descriptionText: "**Usos:**\nFija un mensaje anclado al final del canal\n\n**Aliases:**\n`stickymessage`, `fijar`\n\n```js\n.sticky set <mensaje> [#canal] [--embed nombre]\n.sticky remove [#canal]\n.sticky list\nEjemplo: .sticky set Lee las reglas del canal```",
  },
  {
    name: "temp",
    description: "Crea canales temporales con autodestrucción o un Hub Join-to-Create",
    aliases: ["tempchannel", "tempch", "voicehub"],
    authorName: "Comando Temp",
    descriptionText: "**Usos:**\nCrea canales temporales o configura un Voice Hub\n\n**Aliases:**\n`tempchannel`, `tempch`, `voicehub`\n\n```js\n.temp timed <duracion> [text|voice] [nombre]\n.temp hub <#voz> [plantilla]\n.temp off\nEjemplo: .temp timed 2h evento-rapido```",
  },
  {
    name: "voicelink",
    description: "Vincula un canal de voz con un canal de texto privado dinámico",
    aliases: ["voicetext", "vtext", "vlink"],
    authorName: "Comando Voicelink",
    descriptionText: "**Usos:**\nVincula un canal de voz a un canal de texto privado\n\n**Aliases:**\n`voicetext`, `vtext`, `vlink`\n\n```js\n.voicelink add <#voz> <#texto>\n.voicelink remove <#voz> <#texto>\n.voicelink list```",
  },
  { name: "ticketsetup", description: "Configura categoría, rol de soporte y canal de transcripciones", aliases: ["tsetup"] },
  { name: "ticketpanel", description: "Envía un panel interactivo para abrir tickets en un canal", aliases: ["tpanel"] },
  { name: "ticketclose", description: "Cierra el ticket actual y guarda su transcripción", aliases: ["tclose", "cerrarticket"] },
  {
    name: "ticketadd",
    description: "Añade a un usuario al ticket actual",
    aliases: ["tadd"],
    authorName: "Comando Ticketadd",
    descriptionText: "**Usos:**\nAñade a un usuario al ticket actual\n\n**Aliases:**\n`tadd`\n\n```js\n.ticketadd <@usuario>```",
  },
  {
    name: "ticketremove",
    description: "Quita el acceso de un usuario al ticket actual",
    aliases: ["tremove"],
    authorName: "Comando Ticketremove",
    descriptionText: "**Usos:**\nQuita el acceso de un usuario al ticket actual\n\n**Aliases:**\n`tremove`\n\n```js\n.ticketremove <@usuario>```",
  },
  { name: "ticketclaim", description: "Reclama el ticket actual como miembro del equipo", aliases: ["tclaim"] },
  { name: "transcript", description: "Exporta el historial completo (.html y .txt) del ticket actual", aliases: ["tickettranscript", "ttranscript"] },
  {
    name: "cmdadd",
    description: "Crea un comando personalizado o auto-respuesta con TagScript",
    aliases: ["addcmd", "ccadd"],
    authorName: "Comando Cmdadd",
    descriptionText: "**Usos:**\nCrea un comando personalizado o auto-respuesta con TagScript\n\n**Aliases:**\n`addcmd`, `ccadd`\n\n```js\n.cmdadd <disparador> <respuesta> [--tipo exact|startswith|contains|regex] [--embed nombre]\nEjemplo: .cmdadd saludo Hola {user}, bienvenido a {server}!```",
  },
  {
    name: "cmdremove",
    description: "Elimina un comando personalizado",
    aliases: ["delcmd", "ccremove"],
    authorName: "Comando Cmdremove",
    descriptionText: "**Usos:**\nElimina un comando personalizado\n\n**Aliases:**\n`delcmd`, `ccremove`\n\n```js\n.cmdremove <disparador>```",
  },
  { name: "cmdlist", description: "Lista los comandos personalizados del servidor", aliases: ["listcmd", "cclist"] },
  {
    name: "embedadd",
    description: "Guarda una plantilla de Embed reutilizable",
    aliases: ["addembed"],
    authorName: "Comando Embedadd",
    descriptionText: "**Usos:**\nGuarda una plantilla de Embed con TagScript\n\n**Aliases:**\n`addembed`\n\n```js\n.embedadd <nombre> <descripcion> [--titulo ...] [--color #ff383d]\nEjemplo: .embedadd reglas Respeta a todos --titulo Reglas```",
  },
  {
    name: "embedview",
    description: "Previsualiza o envía una plantilla de Embed guardada",
    aliases: ["viewembed", "sendembed"],
    authorName: "Comando Embedview",
    descriptionText: "**Usos:**\nPrevisualiza o envía una plantilla Embed a un canal\n\n**Aliases:**\n`viewembed`, `sendembed`\n\n```js\n.embedview <nombre> [#canal]```",
  },
  {
    name: "embedremove",
    description: "Elimina una plantilla de Embed",
    aliases: ["delembed"],
    authorName: "Comando Embedremove",
    descriptionText: "**Usos:**\nElimina una plantilla de Embed\n\n**Aliases:**\n`delembed`\n\n```js\n.embedremove <nombre>```",
  },
  { name: "embedlist", description: "Lista todas las plantillas de Embed del servidor", aliases: ["listembed"] },
  {
    name: "timeradd",
    description: "Crea un mensaje automático recurrente en un canal",
    aliases: ["addtimer"],
    authorName: "Comando Timeradd",
    descriptionText: "**Usos:**\nCrea un mensaje automático recurrente en un canal\n\n**Aliases:**\n`addtimer`\n\n```js\n.timeradd <#canal> <intervalo> <mensaje> [--embed nombre]\nEjemplo: .timeradd #general 2h Recuerda leer las reglas```",
  },
  {
    name: "timerremove",
    description: "Elimina un mensaje automático recurrente por su ID",
    aliases: ["deltimer"],
    authorName: "Comando Timerremove",
    descriptionText: "**Usos:**\nElimina un mensaje automático recurrente\n\n**Aliases:**\n`deltimer`\n\n```js\n.timerremove <id>```",
  },
  { name: "timerlist", description: "Lista los mensajes automáticos recurrentes del servidor", aliases: ["listtimer"] },
  {
    name: "ruleadd",
    description: "Crea una regla lógica de automatización del servidor",
    aliases: ["addrule"],
    authorName: "Comando Ruleadd",
    descriptionText: "**Usos:**\nCrea una regla lógica de automatización\n\n**Aliases:**\n`addrule`\n\n```js\n.ruleadd <nombre> <evento> <condicion> <accion> [--cond val] [--val texto]\nEventos: message, member_join, voice_join\nCondiciones: always, contains, has_role, is_bot, not_bot, in_channel, account_age_lt_days\nAcciones: send_channel, send_dm, add_role, remove_role, delete_message```",
  },
  {
    name: "ruleremove",
    description: "Elimina una regla lógica de automatización",
    aliases: ["delrule"],
    authorName: "Comando Ruleremove",
    descriptionText: "**Usos:**\nElimina una regla de automatización\n\n**Aliases:**\n`delrule`\n\n```js\n.ruleremove <nombre>```",
  },
  { name: "rulelist", description: "Lista las reglas lógicas de automatización del servidor", aliases: ["listrule"] },
  {
    name: "feedadd",
    description: "Suscribe un canal de Discord a notificaciones sociales",
    aliases: ["addfeed", "feedsadd"],
    authorName: "Comando Feedadd",
    descriptionText: "**Usos:**\nSuscribe un canal a YouTube, Twitch, Kick, TikTok o Reddit\n\n**Aliases:**\n`addfeed`, `feedsadd`\n\n```js\n.feedadd <youtube|twitch|kick|tiktok|reddit> <cuenta> <#canal> [mensaje]\nEjemplo: .feedadd twitch ibai #directos ¡En vivo! {url}```",
  },
  {
    name: "feedremove",
    description: "Elimina una alerta social configurada",
    aliases: ["delfeed", "feedsremove"],
    authorName: "Comando Feedremove",
    descriptionText: "**Usos:**\nElimina una alerta social configurada\n\n**Aliases:**\n`delfeed`, `feedsremove`\n\n```js\n.feedremove <youtube|twitch|kick|tiktok|reddit> <cuenta>```",
  },
  { name: "feedlist", description: "Lista las alertas sociales activas del servidor", aliases: ["feeds", "feedslist"] },
  {
    name: "feedtest",
    description: "Prueba manualmente una alerta social y muestra su última publicación",
    aliases: ["testfeed", "feedstest"],
    authorName: "Comando Feedtest",
    descriptionText: "**Usos:**\nPrueba manualmente una alerta social\n\n**Aliases:**\n`testfeed`, `feedstest`\n\n```js\n.feedtest <youtube|twitch|kick|tiktok|reddit> <cuenta>```",
  },
  { name: "welcome", description: "Configura o prueba el canal y mensaje de bienvenida", aliases: ["bienvenida"] },
  { name: "goodbye", description: "Configura o prueba el canal y embed de despedidas", aliases: ["despedida"] },
  { name: "birthday", description: "Registra o borra tu fecha de cumpleaños en el servidor", aliases: ["cumple", "cumpleanos", "bday"] },
  { name: "birthdays", description: "Lista los cumpleaños registrados en el servidor", aliases: ["cumples", "bdays"] },
  { name: "birthdaysetup", description: "Configura el canal, rol temporal (24h) y mensaje de cumpleaños", aliases: ["cumplesetup", "bdaysetup"] },
  { name: "invitetop", description: "Ranking de miembros con más invitaciones", aliases: ["inviteleaderboard", "topinvites"] },
  {
    name: "inviteadd",
    description: "Suma o resta invitaciones bonus a un usuario",
    aliases: ["addinvites"],
    authorName: "Comando Inviteadd",
    descriptionText: "**Usos:**\nAjusta invitaciones bonus de un usuario\n\n**Aliases:**\n`addinvites`\n\n```js\n.inviteadd <@usuario> <cantidad>\nEjemplo: .inviteadd @loge 5```",
  },
  {
    name: "invitereward",
    description: "Configura o quita un rol de recompensa por invitaciones",
    aliases: ["rewardinvites"],
    authorName: "Comando Invitereward",
    descriptionText: "**Usos:**\nConfigura un rol automático al alcanzar invitaciones\n\n**Aliases:**\n`rewardinvites`\n\n```js\n.invitereward <invitaciones> [@rol]\nEjemplo: .invitereward 10 @VIP```",
  },
];

module.exports = {
  data: [...DEFINITIONS.map(buildPrefixedCommand), dmallCommand],
};
