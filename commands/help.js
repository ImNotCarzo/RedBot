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
  diversion:  "IA",
};

// ─────────────────────────────────────────────
//  COMANDOS
// ─────────────────────────────────────────────

const COMMANDS = {
  utilidad: {
    ping: {
      short: "ping",
      slash: "util ping",
      slashId: "1481436920075649286",
      usage: ".ping",
      aliases: [],
      description: "Muestra la latencia actual del bot.",
    },
    botinfo: {
      short: "botinfo",
      slash: "util botinfo",
      slashId: "1481436920075649286",
      usage: ".botinfo",
      aliases: ["bot", "info"],
      description: "Muestra información general del bot.",
    },
    invite: {
      short: "invite",
      slash: "util invite",
      slashId: "1481436920075649286",
      usage: ".invite",
      aliases: ["inv"],
      description: "Envía la invitación del bot y el servidor de soporte.",
    },
    setprefix: {
      short: "setprefix",
      slash: "util setprefix",
      slashId: "1481436920075649286",
      usage: ".setprefix <nuevo>",
      aliases: ["prefix"],
      description: "Cambia o muestra el prefijo del bot en este servidor.",
    },
    askreset: {
      short: "askreset",
      slash: "util askreset",
      slashId: "1481436920075649286",
      usage: ".askreset",
      aliases: ["aireset", "reset"],
      description: "Limpia tu historial de conversación con la IA.",
    },
    ask: {
      short: "ask",
      slash: "ask",
      slashId: "1481436920075649278",
      usage: ".ask <pregunta>",
      aliases: ["ia", "ai"],
      description: "Hazle una pregunta a la IA.",
    },
  },
  usuario: {
    info: {
      short: "user",
      slash: "user info",
      slashId: "1481436920075649285",
      usage: ".user [@usuario]",
      aliases: ["userinfo", "ui", "whois"],
      description: "Muestra información general de un usuario.",
    },
    avatar: {
      short: "avatar",
      slash: "user avatar",
      slashId: "1481436920075649285",
      usage: ".avatar [@usuario]",
      aliases: ["av", "pfp"],
      description: "Muestra el avatar de un usuario.",
    },
    banner: {
      short: "banner",
      slash: "user banner",
      slashId: "1481436920075649285",
      usage: ".banner [@usuario]",
      aliases: ["userbanner", "ub"],
      description: "Muestra el banner de un usuario.",
    },
    roles: {
      short: "uroles",
      slash: "user roles",
      slashId: "1481436920075649285",
      usage: ".uroles [@usuario]",
      aliases: ["userroles", "ur"],
      description: "Muestra los roles de un usuario.",
    },
    permissions: {
      short: "perms",
      slash: "user permissions",
      slashId: "1481436920075649285",
      usage: ".perms [@usuario]",
      aliases: ["userperms", "up"],
      description: "Muestra los permisos de un usuario en el servidor.",
    },
  },
  moderacion: {
    ban: {
      short: "ban",
      slash: "mod ban",
      slashId: "1481436920075649282",
      usage: ".ban <@usuario> [razón]",
      aliases: [],
      description: "Banea a un usuario del servidor.",
    },
    unban: {
      short: "unban",
      slash: "mod unban",
      slashId: "1481436920075649282",
      usage: ".unban <id> [razón]",
      aliases: [],
      description: "Desbanea a un usuario por ID.",
    },
    softban: {
      short: "softban",
      slash: "mod softban",
      slashId: "1481436920075649282",
      usage: ".softban <@usuario> [razón]",
      aliases: ["sb"],
      description: "Banea y desbanea al instante para borrar mensajes recientes.",
    },
    tempban: {
      short: "tempban",
      slash: "mod tempban",
      slashId: "1481436920075649282",
      usage: ".tempban <@usuario> <tiempo> [razón]",
      aliases: ["tb"],
      description: "Banea a un usuario por un tiempo determinado.",
    },
    massban: {
      short: "massban",
      slash: "mod massban",
      slashId: "1481436920075649282",
      usage: ".massban <@u1> [@u2] ... [razón]",
      aliases: ["mb"],
      description: "Banea hasta 5 usuarios seleccionados.",
    },
    kick: {
      short: "kick",
      slash: "mod kick",
      slashId: "1481436920075649282",
      usage: ".kick <@usuario> [razón]",
      aliases: [],
      description: "Expulsa a un usuario del servidor.",
    },
    mute: {
      short: "mute",
      slash: "mod mute",
      slashId: "1481436920075649282",
      usage: ".mute <@usuario> <tiempo> [razón]",
      aliases: ["timeout", "silenciar"],
      description: "Silencia a un usuario con timeout.",
    },
    unmute: {
      short: "unmute",
      slash: "mod unmute",
      slashId: "1481436920075649282",
      usage: ".unmute <@usuario> [razón]",
      aliases: ["untimeout", "desmutear"],
      description: "Quita el timeout a un usuario.",
    },
    purge: {
      short: "purge",
      slash: "mod purge",
      slashId: "1481436920075649282",
      usage: ".purge <cantidad> [@usuario]",
      aliases: ["clear", "limpiar"],
      description: "Elimina mensajes del canal.",
    },
    warn: {
      short: "warn",
      slash: "mod warn",
      slashId: "1481436920075649282",
      usage: ".warn <@usuario> <razón>",
      aliases: ["advertir"],
      description: "Advierte a un usuario.",
    },
    removewarn: {
      short: "removewarn",
      slash: "mod removewarn",
      slashId: "1481436920075649282",
      usage: ".removewarn <warnID>",
      aliases: ["rwarn", "delwarn"],
      description: "Elimina una advertencia por su ID.",
    },
    clearwarns: {
      short: "clearwarns",
      slash: "mod clearwarns",
      slashId: "1481436920075649282",
      usage: ".clearwarns <@usuario>",
      aliases: ["cwarns", "resetwarns"],
      description: "Borra todas las advertencias de un usuario.",
    },
    warnings: {
      short: "warnings",
      slash: "mod warnings",
      slashId: "1481436920075649282",
      usage: ".warnings <@usuario>",
      aliases: ["warns", "infracciones"],
      description: "Ver advertencias de un usuario.",
    },
    setlogs: {
      short: "setlogs",
      slash: "mod setlogs",
      slashId: "1481436920075649282",
      usage: ".setlogs <#canal>",
      aliases: ["logs"],
      description: "Establece el canal de logs para RedBot.",
    },
    removelogs: {
      short: "removelogs",
      slash: "mod removelogs",
      slashId: "1481436920075649282",
      usage: ".removelogs",
      aliases: ["dellogs", "nologs"],
      description: "Desactiva los logs de RedBot en el servidor.",
    },
  },
  servidor: {
    info: {
      short: "server",
      slash: "server info",
      slashId: "1481436920075649284",
      usage: ".server",
      aliases: ["sv", "serverinfo", "si"],
      description: "Muestra información general del servidor.",
    },
    logo: {
      short: "logo",
      slash: "server logo",
      slashId: "1481436920075649284",
      usage: ".logo",
      aliases: ["icon", "servericon"],
      description: "Muestra el logo del servidor.",
    },
    banner: {
      short: "sbanner",
      slash: "server banner",
      slashId: "1481436920075649284",
      usage: ".sbanner",
      aliases: ["serverbanner"],
      description: "Muestra el banner del servidor.",
    },
    emojis: {
      short: "emojis",
      slash: "server emojis",
      slashId: "1481436920075649284",
      usage: ".emojis",
      aliases: ["serveremojis", "emoji"],
      description: "Muestra todos los emojis del servidor.",
    },
    roles: {
      short: "sroles",
      slash: "server roles",
      slashId: "1481436920075649284",
      usage: ".sroles",
      aliases: ["serverroles", "listroles"],
      description: "Lista los roles del servidor.",
    },
  },
  roles: {
    info: {
      short: "role",
      slash: "role info",
      slashId: "1481436920075649283",
      usage: ".role <@rol>",
      aliases: ["roleinfo", "ri"],
      description: "Muestra información de un rol.",
    },
    icon: {
      short: "ricon",
      slash: "role icon",
      slashId: "1481436920075649283",
      usage: ".ricon <@rol>",
      aliases: ["roleicon"],
      description: "Muestra el icono de un rol.",
    },
    color: {
      short: "rcolor",
      slash: "role color",
      slashId: "1481436920075649283",
      usage: ".rcolor <@rol>",
      aliases: ["rolecolor", "rolcolor"],
      description: "Muestra el color de un rol.",
    },
    users: {
      short: "rusers",
      slash: "role users",
      slashId: "1481436920075649283",
      usage: ".rusers <@rol>",
      aliases: ["roleusers", "rwho"],
      description: "Lista usuarios con un rol.",
    },
    add: {
      short: "radd",
      slash: "role add",
      slashId: "1481436920075649283",
      usage: ".radd <@usuario> <@rol>",
      aliases: ["roleadd", "addrole"],
      description: "Añade un rol a un usuario.",
    },
    remove: {
      short: "rremove",
      slash: "role remove",
      slashId: "1481436920075649283",
      usage: ".rremove <@usuario> <@rol>",
      aliases: ["roleremove", "delrole"],
      description: "Quita un rol a un usuario.",
    },
    rename: {
      short: "rrename",
      slash: "role rename",
      slashId: "1481436920075649283",
      usage: ".rrename <@rol> <nombre>",
      aliases: ["renamerole"],
      description: "Renombra un rol.",
    },
    hoist: {
      short: "rhoist",
      slash: "role hoist",
      slashId: "1481436920075649283",
      usage: ".rhoist <@rol>",
      aliases: ["rolehoist"],
      description: "Activa o desactiva si un rol se muestra separado.",
    },
    mentionable: {
      short: "rmention",
      slash: "role mentionable",
      slashId: "1481436920075649283",
      usage: ".rmention <@rol>",
      aliases: ["rolemention", "mentionable"],
      description: "Activa o desactiva si un rol es mencionable.",
    },
    random: {
      short: "rrandom",
      slash: "role random",
      slashId: "1481436920075649283",
      usage: ".rrandom",
      aliases: ["randomrole"],
      description: "Muestra un rol aleatorio del servidor.",
    },
  },
  canal: {
    info: {
      short: "cinfo",
      slash: "channel info",
      slashId: "1481436920075649280",
      usage: ".cinfo [#canal]",
      aliases: ["chinfo", "channelinfo"],
      description: "Muestra información de un canal.",
    },
    rename: {
      short: "crename",
      slash: "channel rename",
      slashId: "1481436920075649280",
      usage: ".crename <#canal> <nombre>",
      aliases: ["chrename", "chanrename"],
      description: "Renombra un canal.",
    },
    lock: {
      short: "lock",
      slash: "channel lock",
      slashId: "1481436920075649280",
      usage: ".lock [#canal]",
      aliases: ["lockdown", "cerrar"],
      description: "Bloquea un canal para usuarios normales.",
    },
    unlock: {
      short: "unlock",
      slash: "channel unlock",
      slashId: "1481436920075649280",
      usage: ".unlock [#canal]",
      aliases: ["abrir", "desbloquear"],
      description: "Abre un canal bloqueado.",
    },
    slowmode: {
      short: "sm",
      slash: "channel slowmode",
      slashId: "1481436920075649280",
      usage: ".sm <tiempo> [#canal]",
      aliases: ["slowmode", "lento"],
      description: "Establece el slowmode de un canal (0 para desactivar).",
    },
    nuke: {
      short: "nuke",
      slash: "channel nuke",
      slashId: "1481436920075649280",
      usage: ".nuke [#canal]",
      aliases: ["vaciar", "limpiar"],
      description: "Recrea el canal borrando todos sus mensajes.",
    },
    clone: {
      short: "clone",
      slash: "channel clone",
      slashId: "1481436920075649280",
      usage: ".clone [#canal]",
      aliases: ["clonar", "duplicar"],
      description: "Clona un canal con su configuración.",
    },
    permit: {
      short: "permit",
      slash: "channel permit",
      slashId: "1481436920075649280",
      usage: ".permit <@usuario> [#canal]",
      aliases: ["allow", "acceso"],
      description: "Da acceso a un usuario en un canal.",
    },
    deny: {
      short: "deny",
      slash: "channel deny",
      slashId: "1481436920075649280",
      usage: ".deny <@usuario> [#canal]",
      aliases: ["block", "denegar"],
      description: "Quita el acceso a un usuario en un canal.",
    },
    hide: {
      short: "hide",
      slash: "channel hide",
      slashId: "1481436920075649280",
      usage: ".hide [#canal]",
      aliases: ["ocultar", "esconder"],
      description: "Oculta un canal a @everyone.",
    },
  },
  diversion: {
    ask: {
      short: "ask",
      slash: "ask",
      slashId: "1481436920075649278",
      usage: ".ask <pregunta>",
      aliases: ["ia", "ai"],
      description: "Hazle una pregunta a la IA.",
    },
    askreset: {
      short: "askreset",
      slash: "util askreset",
      slashId: "1481436920075649286",
      usage: ".askreset",
      aliases: ["reset", "aireset"],
      description: "Limpia tu historial de conversación con la IA.",
    },
    opinion: {
      short: "opinion",
      slash: "fun opinion",
      slashId: "1481436920075649281",
      usage: ".opinion <tema>",
      aliases: ["op", "opina"],
      description: "Pide mi opinión sin filtro sobre algo.",
    },
    critica: {
      short: "critica",
      slash: "fun critica",
      slashId: "1481436920075649281",
      usage: ".critica <tema>",
      aliases: ["criticar"],
      description: "Te doy una crítica despiadada de algo.",
    },
    excusa: {
      short: "excusa",
      slash: "fun excusa",
      slashId: "1481436920075649281",
      usage: ".excusa [situacion]",
      aliases: ["coartada"],
      description: "Genera una excusa ridícula pero creativa.",
    },
    teoria: {
      short: "teoria",
      slash: "fun teoria",
      slashId: "1481436920075649281",
      usage: ".teoria <tema>",
      aliases: ["conspira"],
      description: "Una teoría conspirativa sobre cualquier cosa.",
    },
    roast: {
      short: "roast",
      slash: "fun roast",
      slashId: "1481436920075649281",
      usage: ".roast [@usuario]",
      aliases: ["burn"],
      description: "Critica despiadadamente a un usuario.",
    },
  },
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

// Separador seguro para values del select — evita bugs con keys que tienen "_"
const SEP = "||";

const formatSelectLabel = (cmd) =>
  cmd.slash
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

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

      const formatCommand = (cmd) =>
        cmd.short
          ? (isSlash ? `</${cmd.slash}:${cmd.slashId}>` : `${prefix}${cmd.short}`)
          : `</${cmd.slash}:${cmd.slashId}>`;

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
                  .setValue(`${category}${SEP}${key}`)  // ← separador seguro
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

      // Estado mutable para el collector de select
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

        // customId formato: help_cat_<categoria>
        const category = i.customId.replace("help_cat_", "");
        currentCategory = category;

        await i.update({
          flags: MessageFlags.IsComponentsV2,
          components: [buildContainer(category), buildDeleteRow()],
        }).catch(() => {});
      });

      selectCollector.on("collect", async (i) => {
        // value formato: "<category>||<key>"
        const sepIdx  = i.values[0].indexOf(SEP);
        const category = i.values[0].slice(0, sepIdx);
        const key      = i.values[0].slice(sepIdx + SEP.length);
        const cmd      = COMMANDS[category]?.[key];

        if (!cmd) return i.reply({ content: "No encontré ese comando", flags: MessageFlags.Ephemeral }).catch(() => {});

        const embed = new EmbedBuilder()
          .setColor("#ff383d")
          .setTitle(formatSelectLabel(cmd))
          .addFields(
            { name: "Uso",         value: (isSlash || !cmd.short) ? `</${cmd.slash}:${cmd.slashId}>` : `\`${cmd.usage}\`` },
            { name: "Descripción", value: cmd.description },
            ...(cmd.aliases.length ? [{ name: "Alias", value: cmd.aliases.map(a => `\`${prefix}${a}\``).join(", ") }] : []),
          );

        // reply ephemeral para no romper el estado del mensaje principal
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
