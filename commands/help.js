const { CommandBuilder } = require("erine");
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SeparatorSpacingSize,
  MessageFlags,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
} = require("discord.js");

const IDS = {
  ask:     "1482626230078410762",
  util:    "1482626230078410771",
  user:    "1482626230078410770",
  mod:     "1482626230078410767",
  server:  "1482626230078410767",
  role:    "1482626230078410768",
  channel: "1482626230078410764",
  fun:     "1482626230078410765",
};

// ─────────────────────────────────────────────
//  CATEGORÍAS
// ─────────────────────────────────────────────

const CATEGORIES = ["utilidad", "usuario", "moderacion", "servidor", "roles", "canal", "diversion"];

const CATEGORY_LABELS = {
  utilidad:   "Utilidad",
  usuario:    "Usuario",
  moderacion: "Moderación",
  servidor:   "Servidor",
  roles:      "Roles",
  canal:      "Canal",
  diversion:  "Fun",
};

// ─────────────────────────────────────────────
//  COMANDOS
// ─────────────────────────────────────────────

const COMMANDS = {
  utilidad: {
    ask:       { short: "ask",       slash: "ask",            id: IDS.ask,  usage: ".ask <pregunta>",            aliases: ["ai", "ia"],                    description: "Hazle una pregunta a la IA." },
    ping:      { short: "ping",      slash: "util ping",      id: IDS.util, usage: ".ping",                      aliases: [],                               description: "Muestra la latencia actual del bot." },
    botinfo:   { short: "botinfo",   slash: "util botinfo",   id: IDS.util, usage: ".botinfo",                   aliases: ["bot", "info"],                  description: "Muestra información general del bot." },
    invite:    { short: "invite",    slash: "util invite",    id: IDS.util, usage: ".invite",                    aliases: ["inv"],                           description: "Envía la invitación del bot y el servidor de soporte." },
    setprefix: { short: "setprefix", slash: "util setprefix", id: IDS.util, usage: ".setprefix <nuevo>",         aliases: ["prefix"],                       description: "Cambia o muestra el prefijo del bot en este servidor." },
    askreset:  { short: "askreset",  slash: "util askreset",  id: IDS.util, usage: ".askreset",                  aliases: ["aireset", "reset"],             description: "Limpia tu historial de conversación con la IA." },
    translate: { short: "translate", slash: "util translate", id: IDS.util, usage: ".translate <texto> [idioma]",aliases: ["traducir", "trans"],            description: "Traduce texto a otro idioma." },
    describe:  { short: "describe",  slash: "util describe",  id: IDS.util, usage: ".describe <url | adjunto>",  aliases: ["describir"],                    description: "Describe el contenido de una imagen." },
    transcribe:{ short: "transcribe",slash: "util transcribe",id: IDS.util, usage: ".transcribe <url | adjunto>",aliases: ["transcribir"],                  description: "Transcribe un audio o video a texto." },
    resumir:   { short: "resumir",   slash: "util resumir",   id: IDS.util, usage: ".resumir <texto>",           aliases: ["resume", "summarize"],          description: "Resume un texto largo." },
  },
  usuario: {
    info:        { short: "user",   slash: "user info",        id: IDS.user, usage: ".user [@usuario]",   aliases: ["userinfo", "ui", "whois"],    description: "Muestra información general de un usuario." },
    avatar:      { short: "avatar", slash: "user avatar",      id: IDS.user, usage: ".avatar [@usuario]", aliases: ["av", "pfp"],                  description: "Muestra el avatar de un usuario." },
    banner:      { short: "banner", slash: "user banner",      id: IDS.user, usage: ".banner [@usuario]", aliases: ["userbanner", "ub"],           description: "Muestra el banner de un usuario." },
    roles:       { short: "uroles", slash: "user roles",       id: IDS.user, usage: ".uroles [@usuario]", aliases: ["userroles", "ur"],            description: "Muestra los roles de un usuario." },
    permissions: { short: "perms",  slash: "user permissions", id: IDS.user, usage: ".perms [@usuario]",  aliases: ["userperms", "up"],            description: "Muestra los permisos de un usuario en el servidor." },
  },
  moderacion: {
    ban:        { short: "ban",        slash: "mod ban",        id: IDS.mod, usage: ".ban <@usuario> [razón]",            aliases: [],                          description: "Banea a un usuario del servidor." },
    unban:      { short: "unban",      slash: "mod unban",      id: IDS.mod, usage: ".unban <id> [razón]",                aliases: [],                          description: "Desbanea a un usuario por ID." },
    softban:    { short: "softban",    slash: "mod softban",    id: IDS.mod, usage: ".softban <@usuario> [razón]",        aliases: ["sb"],                      description: "Banea y desbanea al instante para borrar mensajes recientes." },
    tempban:    { short: "tempban",    slash: "mod tempban",    id: IDS.mod, usage: ".tempban <@usuario> <tiempo> [razón]",aliases: ["tb"],                     description: "Banea a un usuario por un tiempo determinado." },
    massban:    { short: "massban",    slash: "mod massban",    id: IDS.mod, usage: ".massban <@u1> [@u2] ... [razón]",   aliases: ["mb"],                      description: "Banea hasta 5 usuarios seleccionados." },
    kick:       { short: "kick",       slash: "mod kick",       id: IDS.mod, usage: ".kick <@usuario> [razón]",           aliases: [],                          description: "Expulsa a un usuario del servidor." },
    mute:       { short: "mute",       slash: "mod mute",       id: IDS.mod, usage: ".mute <@usuario> <tiempo> [razón]",  aliases: ["timeout", "silenciar"],    description: "Silencia a un usuario con timeout." },
    unmute:     { short: "unmute",     slash: "mod unmute",     id: IDS.mod, usage: ".unmute <@usuario> [razón]",         aliases: ["untimeout", "desmutear"],  description: "Quita el timeout a un usuario." },
    purge:      { short: "purge",      slash: "mod purge",      id: IDS.mod, usage: ".purge <cantidad> [@usuario]",       aliases: ["clear", "limpiar"],        description: "Elimina mensajes del canal." },
    warn:       { short: "warn",       slash: "mod warn",       id: IDS.mod, usage: ".warn <@usuario> <razón>",           aliases: ["advertir"],                description: "Advierte a un usuario." },
    removewarn: { short: "removewarn", slash: "mod removewarn", id: IDS.mod, usage: ".removewarn <warnID>",               aliases: ["rwarn", "delwarn"],        description: "Elimina una advertencia por su ID." },
    clearwarns: { short: "clearwarns", slash: "mod clearwarns", id: IDS.mod, usage: ".clearwarns <@usuario>",             aliases: ["cwarns", "resetwarns"],    description: "Borra todas las advertencias de un usuario." },
    warnings:   { short: "warnings",   slash: "mod warnings",   id: IDS.mod, usage: ".warnings <@usuario>",               aliases: ["warns", "infracciones"],   description: "Ver advertencias de un usuario." },
    setlogs:    { short: "setlogs",    slash: "mod setlogs",    id: IDS.mod, usage: ".setlogs <#canal>",                  aliases: ["logs"],                    description: "Establece el canal de logs para RedBot." },
    removelogs: { short: "removelogs", slash: "mod removelogs", id: IDS.mod, usage: ".removelogs",                        aliases: ["dellogs", "nologs"],       description: "Desactiva los logs de RedBot en el servidor." },
  },
  servidor: {
    info:   { short: "server",  slash: "server info",   id: IDS.server, usage: ".server",  aliases: ["sv", "serverinfo", "si"], description: "Muestra información general del servidor." },
    logo:   { short: "logo",    slash: "server logo",   id: IDS.server, usage: ".logo",    aliases: ["icon", "servericon"],     description: "Muestra el logo del servidor." },
    banner: { short: "sbanner", slash: "server banner", id: IDS.server, usage: ".sbanner", aliases: ["serverbanner"],           description: "Muestra el banner del servidor." },
    emojis: { short: "emojis",  slash: "server emojis", id: IDS.server, usage: ".emojis",  aliases: ["serveremojis", "emoji"],  description: "Muestra todos los emojis del servidor." },
    roles:  { short: "sroles",  slash: "server roles",  id: IDS.server, usage: ".sroles",  aliases: ["serverroles", "listroles"],description: "Lista los roles del servidor." },
  },
  roles: {
    info:        { short: "role",    slash: "role info",        id: IDS.role, usage: ".role <@rol>",             aliases: ["roleinfo", "ri"],              description: "Muestra información de un rol." },
    icon:        { short: "ricon",   slash: "role icon",        id: IDS.role, usage: ".ricon <@rol>",            aliases: ["roleicon"],                    description: "Muestra el icono de un rol." },
    color:       { short: "rcolor",  slash: "role color",       id: IDS.role, usage: ".rcolor <@rol>",           aliases: ["rolecolor", "rolcolor"],       description: "Muestra el color de un rol." },
    users:       { short: "rusers",  slash: "role users",       id: IDS.role, usage: ".rusers <@rol>",           aliases: ["roleusers", "rwho"],           description: "Lista usuarios con un rol." },
    add:         { short: "radd",    slash: "role add",         id: IDS.role, usage: ".radd <@usuario> <@rol>",  aliases: ["roleadd", "addrole"],          description: "Añade un rol a un usuario." },
    remove:      { short: "rremove", slash: "role remove",      id: IDS.role, usage: ".rremove <@usuario> <@rol>",aliases: ["roleremove", "delrole"],      description: "Quita un rol a un usuario." },
    rename:      { short: "rrename", slash: "role rename",      id: IDS.role, usage: ".rrename <@rol> <nombre>", aliases: ["renamerole"],                  description: "Renombra un rol." },
    hoist:       { short: "rhoist",  slash: "role hoist",       id: IDS.role, usage: ".rhoist <@rol>",           aliases: ["rolehoist"],                   description: "Activa o desactiva si un rol se muestra separado." },
    mentionable: { short: "rmention",slash: "role mentionable", id: IDS.role, usage: ".rmention <@rol>",         aliases: ["rolemention"],                 description: "Activa o desactiva si un rol es mencionable." },
    random:      { short: "rrandom", slash: "role random",      id: IDS.role, usage: ".rrandom",                 aliases: ["randomrole"],                  description: "Muestra un rol aleatorio del servidor." },
    all:         { short: "roleall", slash: "role all",         id: IDS.role, usage: ".roleall <@rol> [bots]",   aliases: ["allrole"],                     description: "Añade un rol a todos los miembros." },
    removeall:   { short: "roleremoveall", slash: "role removeall", id: IDS.role, usage: ".roleremoveall <@rol>",aliases: ["removeroleall"],               description: "Quita un rol a todos los miembros que lo tengan." },
    bots:        { short: "rolebots",slash: "role bots",        id: IDS.role, usage: ".rolebots <@rol> <add|remove>", aliases: ["botsrole"],               description: "Añade o quita un rol a todos los bots." },
    humans:      { short: "rolehumans", slash: "role humans",   id: IDS.role, usage: ".rolehumans <@rol> <add|remove>", aliases: ["humansrole"],            description: "Añade o quita un rol a todos los usuarios." },
    join:        { short: "rolejoin",slash: "role join",        id: IDS.role, usage: ".rolejoin <@rol>",          aliases: ["joinrole", "autorole"],        description: "Configura o desactiva el rol automático al entrar." },
  },
  canal: {
    info:     { short: "cinfo",  slash: "channel info",     id: IDS.channel, usage: ".cinfo [#canal]",            aliases: ["chinfo", "channelinfo"],   description: "Muestra información de un canal." },
    rename:   { short: "crename",slash: "channel rename",   id: IDS.channel, usage: ".crename <#canal> <nombre>", aliases: ["chrename", "chanrename"],  description: "Renombra un canal." },
    lock:     { short: "lock",   slash: "channel lock",     id: IDS.channel, usage: ".lock [#canal]",             aliases: ["lockdown", "cerrar"],      description: "Bloquea un canal para usuarios normales." },
    unlock:   { short: "unlock", slash: "channel unlock",   id: IDS.channel, usage: ".unlock [#canal]",           aliases: ["abrir", "desbloquear"],    description: "Abre un canal bloqueado." },
    slowmode: { short: "sm",     slash: "channel slowmode", id: IDS.channel, usage: ".sm <tiempo> [#canal]",      aliases: ["slowmode", "lento"],       description: "Establece el slowmode de un canal." },
    nuke:     { short: "nuke",   slash: "channel nuke",     id: IDS.channel, usage: ".nuke [#canal]",             aliases: ["vaciar"],                  description: "Recrea el canal borrando todos sus mensajes." },
    clone:    { short: "clone",  slash: "channel clone",    id: IDS.channel, usage: ".clone [#canal]",            aliases: ["clonar", "duplicar"],      description: "Clona un canal con su configuración." },
    permit:   { short: "permit", slash: "channel permit",   id: IDS.channel, usage: ".permit <@usuario> [#canal]",aliases: ["allow", "acceso"],         description: "Da acceso a un usuario en un canal." },
    deny:     { short: "deny",   slash: "channel deny",     id: IDS.channel, usage: ".deny <@usuario> [#canal]",  aliases: ["block", "denegar"],        description: "Quita el acceso a un usuario en un canal." },
    hide:     { short: "hide",   slash: "channel hide",     id: IDS.channel, usage: ".hide [#canal]",             aliases: ["ocultar", "esconder"],     description: "Oculta un canal a @everyone." },
  },
  diversion: {
    opinion: { short: "opinion", slash: "fun opinion", id: IDS.fun, usage: ".opinion <tema>",  aliases: ["op", "opina"],   description: "Pide mi opinión sin filtro sobre algo." },
    critica: { short: "critica", slash: "fun critica", id: IDS.fun, usage: ".critica <tema>",  aliases: ["criticar"],      description: "Te doy una crítica despiadada de algo." },
    excusa:  { short: "excusa",  slash: "fun excusa",  id: IDS.fun, usage: ".excusa [situacion]",aliases: ["coartada"],    description: "Genera una excusa ridícula pero creativa." },
    teoria:  { short: "teoria",  slash: "fun teoria",  id: IDS.fun, usage: ".teoria <tema>",   aliases: ["conspira"],      description: "Una teoría conspirativa sobre cualquier cosa." },
    roast:   { short: "roast",   slash: "fun roast",   id: IDS.fun, usage: ".roast [@usuario]", aliases: ["burn"],         description: "Critica despiadadamente a un usuario." },
  },
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

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
    description: "Muestra la lista de comandos disponibles",
    as_prefix: true,
    as_slash: true,
  }),

  async code(ctx) {
    try {
      const isSlash  = Boolean(ctx.interaction);
      const authorId = ctx.user?.id ?? ctx.author?.id;

      const prefixCache = require("../utils/prefixCache");
      const prefix = (ctx.guild?.id && prefixCache.get(ctx.guild.id)) || ".";

      // Bug fix: prefix siempre muestra prefixed, slash siempre muestra slash
      const formatCommand = (cmd) => {
        if (isSlash) return `</${cmd.slash}:${cmd.id}>`;
        return cmd.short ? `${prefix}${cmd.short}` : `</${cmd.slash}:${cmd.id}>`;
      };

      const buildCommandList = (category) =>
        Object.values(COMMANDS[category]).map(formatCommand).join("\n");

      const buildCategoryRows = (active) => {
        const rows = [];
        for (let i = 0; i < CATEGORIES.length; i += 5) {
          rows.push(
            new ActionRowBuilder().addComponents(
              CATEGORIES.slice(i, i + 5).map(cat =>
                new ButtonBuilder()
                  .setCustomId(`help_cat_${cat}`)
                  .setLabel(CATEGORY_LABELS[cat])
                  .setStyle(cat === active ? ButtonStyle.Danger : ButtonStyle.Secondary)
                  .setDisabled(cat === active)
              )
            )
          );
        }
        return rows;
      };

      const buildSelectRow = (category) =>
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`help_select_${category}`)
            .setPlaceholder("Selecciona un comando para ver detalles")
            .addOptions(
              Object.entries(COMMANDS[category]).map(([key, cmd]) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(formatSelectLabel(cmd))
                  .setValue(`${category}${SEP}${key}`)
                  .setDescription(cmd.description.slice(0, 100))
              )
            )
        );

      const buildLinksRow = () =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Invitar")
            .setStyle(ButtonStyle.Link)
            .setURL("https://discord.com/oauth2/authorize?client_id=1020772849906098186&permissions=0&scope=bot"),
          new ButtonBuilder()
            .setLabel("Soporte")
            .setStyle(ButtonStyle.Link)
            .setURL("https://discord.gg/b8AKKaNWU6"),
        );

      const buildDeleteRow = () =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("help_delete")
            .setLabel("✖")
            .setStyle(ButtonStyle.Secondary)
        );

      const buildContainer = (category) => {
        const container = new ContainerBuilder();
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent("## <:redbot:1474109778044260478> RedBot")
        );
        for (const row of buildCategoryRows(category)) {
          container.addActionRowComponents(row);
        }
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(buildCommandList(category))
        );
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );
        container.addActionRowComponents(buildSelectRow(category));
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );
        container.addActionRowComponents(buildLinksRow());
        return container;
      };

      let currentCategory = "utilidad";

      const message = await ctx.send({
        flags: MessageFlags.IsComponentsV2,
        components: [buildContainer(currentCategory), buildDeleteRow()],
        allowedMentions: { repliedUser: false },
      });

      const collectorFilter = (i) => i.user.id === authorId;

      const buttonCollector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: COLLECTOR_TIMEOUT,
        filter: collectorFilter,
      });

      const selectCollector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: COLLECTOR_TIMEOUT,
        filter: collectorFilter,
      });

      buttonCollector.on("collect", async (i) => {
        if (i.customId === "help_delete") {
          buttonCollector.stop();
          selectCollector.stop();
          return i.message.delete().catch(() => {});
        }

        const category = i.customId.replace("help_cat_", "");
        currentCategory = category;

        await i.update({
          flags: MessageFlags.IsComponentsV2,
          components: [buildContainer(category), buildDeleteRow()],
        }).catch(() => {});
      });

      selectCollector.on("collect", async (i) => {
        const sepIdx   = i.values[0].indexOf(SEP);
        const category = i.values[0].slice(0, sepIdx);
        const key      = i.values[0].slice(sepIdx + SEP.length);
        const cmd      = COMMANDS[category]?.[key];

        if (!cmd) return i.reply({ content: "No encontré ese comando", flags: MessageFlags.Ephemeral }).catch(() => {});

        // En el detalle del select: slash siempre muestra mention, prefix siempre muestra .uso
        const usoValue = isSlash
          ? `</${cmd.slash}:${cmd.id}>`
          : cmd.short ? `\`${cmd.usage}\`` : `</${cmd.slash}:${cmd.id}>`;

        const embed = new EmbedBuilder()
          .setColor("#ff383d")
          .setTitle(formatSelectLabel(cmd))
          .addFields(
            { name: "Uso",         value: usoValue },
            { name: "Descripción", value: cmd.description },
            ...(cmd.aliases.length
              ? [{ name: "Alias", value: cmd.aliases.map(a => `\`${prefix}${a}\``).join(", ") }]
              : []),
          );

        await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
      });

      buttonCollector.on("end", () => {
        message.edit({
          flags: MessageFlags.IsComponentsV2,
          components: [buildContainer(currentCategory)],
        }).catch(() => {});
      });

    } catch (err) {
      console.error("[help]", err);
      await ctx.send("Error al mostrar el help");
    }
  },
};

module.exports = { data };
