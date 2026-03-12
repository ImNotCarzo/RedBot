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
  EmbedBuilder
} = require("discord.js");

const CATEGORIES = ["utilidad", "usuario", "moderacion", "servidor", "roles", "canal", "diversion"];

const CATEGORY_LABELS = {
  utilidad:   "Utilidad",
  usuario:    "Usuario",
  moderacion: "Moderación",
  servidor:   "Servidor",
  roles:      "Roles",
  canal:      "Canal",
  diversion:  "Diversión"
};

const COMMANDS = {
  utilidad: {
    ping: {
      short: "ping",
      slash: "util ping",
      slashId: "1481436920075649286",
      usage: ".ping",
      aliases: [],
      description: "Muestra la latencia actual del bot."
    },
    botinfo: {
      short: "botinfo",
      slash: "util botinfo",
      slashId: "1481436920075649286",
      usage: ".botinfo",
      aliases: ["bot", "info"],
      description: "Muestra información general del bot."
    },
    invite: {
      short: "invite",
      slash: "util invite",
      slashId: "1481436920075649286",
      usage: ".invite",
      aliases: ["inv"],
      description: "Envía la invitación del bot y el servidor de soporte."
    },
    setprefix: {
      short: "setprefix",
      slash: "util setprefix",
      slashId: "1481436920075649286",
      usage: ".setprefix <nuevo>",
      aliases: [],
      description: "Cambia o muestra el prefijo del bot en este servidor."
    },
    askreset: {
      short: "askreset",
      slash: "util askreset",
      slashId: "1481436920075649286",
      usage: ".askreset",
      aliases: ["reset"],
      description: "Limpia tu historial de conversación con la IA."
    },
    ask: {
      short: "ask",
      slash: "ask",
      slashId: "1481436920075649278",
      usage: ".ask <pregunta>",
      aliases: ["ia", "ai"],
      description: "Hazle una pregunta a la IA."
    }
  },
  usuario: {
    info: {
      short: "user",
      slash: "user info",
      slashId: "1481436920075649285",
      usage: ".user <@opcional>",
      aliases: ["userinfo", "ui", "whois"],
      description: "Muestra información general de un usuario."
    },
    avatar: {
      short: "avatar",
      slash: "user avatar",
      slashId: "1481436920075649285",
      usage: ".avatar <@opcional>",
      aliases: ["av", "useravatar"],
      description: "Muestra el avatar de un usuario."
    },
    banner: {
      short: "banner",
      slash: "user banner",
      slashId: "1481436920075649285",
      usage: ".banner <@opcional>",
      aliases: ["userbanner"],
      description: "Muestra el banner de un usuario."
    },
    roles: {
      short: "uroles",
      slash: "user roles",
      slashId: "1481436920075649285",
      usage: ".uroles <@opcional>",
      aliases: ["useroles"],
      description: "Muestra los roles de un usuario."
    },
    permissions: {
      short: null,
      slash: "user permissions",
      slashId: "1481436920075649285",
      usage: null,
      aliases: [],
      description: "Muestra los permisos de un usuario en el servidor."
    }
  },
  moderacion: {
    ban: {
      short: null,
      slash: "mod ban",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Banea a un usuario del servidor."
    },
    unban: {
      short: null,
      slash: "mod unban",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Desbanea a un usuario por ID."
    },
    softban: {
      short: null,
      slash: "mod softban",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Banea y desbanea al instante para borrar mensajes recientes."
    },
    tempban: {
      short: null,
      slash: "mod tempban",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Banea a un usuario por un tiempo determinado."
    },
    massban: {
      short: null,
      slash: "mod massban",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Banea hasta 5 usuarios seleccionados."
    },
    kick: {
      short: null,
      slash: "mod kick",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Expulsa a un usuario del servidor."
    },
    mute: {
      short: null,
      slash: "mod mute",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Silencia a un usuario."
    },
    unmute: {
      short: null,
      slash: "mod unmute",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Quita el timeout a un usuario."
    },
    purge: {
      short: null,
      slash: "mod purge",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Elimina mensajes del canal."
    },
    warn: {
      short: null,
      slash: "mod warn",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Advierte a un usuario."
    },
    removewarn: {
      short: null,
      slash: "mod removewarn",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Elimina una advertencia con su ID."
    },
    clearwarns: {
      short: null,
      slash: "mod clearwarns",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Borra todas las advertencias de un usuario."
    },
    warnings: {
      short: null,
      slash: "mod warnings",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Ver advertencias de un usuario."
    },
    setlogs: {
      short: null,
      slash: "mod setlogs",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Establece el canal de logs para RedBot en el servidor."
    },
    removelogs: {
      short: null,
      slash: "mod removelogs",
      slashId: "1481436920075649282",
      usage: null,
      aliases: [],
      description: "Desactiva los logs de RedBot en el servidor."
    }
  },
  servidor: {
    info: {
      short: "server",
      slash: "server info",
      slashId: "1481436920075649284",
      usage: ".server",
      aliases: ["sv"],
      description: "Muestra información general del servidor."
    },
    logo: {
      short: "logo",
      slash: "server logo",
      slashId: "1481436920075649284",
      usage: ".logo",
      aliases: ["serverlogo", "servericon", "icon"],
      description: "Muestra el logo del servidor."
    },
    banner: {
      short: null,
      slash: "server banner",
      slashId: "1481436920075649284",
      usage: null,
      aliases: [],
      description: "Muestra el banner del servidor."
    },
    emojis: {
      short: "emojis",
      slash: "server emojis",
      slashId: "1481436920075649284",
      usage: ".emojis",
      aliases: ["serveremojis"],
      description: "Muestra todos los emojis del servidor."
    },
    roles: {
      short: "roles",
      slash: "server roles",
      slashId: "1481436920075649284",
      usage: ".roles",
      aliases: ["serverroles"],
      description: "Lista los roles del servidor."
    }
  },
  roles: {
    info: {
      short: "role",
      slash: "role info",
      slashId: "1481436920075649283",
      usage: ".role <@rol>",
      aliases: ["roleinfo", "inforole"],
      description: "Muestra información de un rol."
    },
    icon: {
      short: "roleicon",
      slash: "role icon",
      slashId: "1481436920075649283",
      usage: ".roleicon <@rol>",
      aliases: ["iconrole", "ricon"],
      description: "Muestra el icono de un rol."
    },
    color: {
      short: "color",
      slash: "role color",
      slashId: "1481436920075649283",
      usage: ".color <@rol>",
      aliases: ["colorrole", "rolecolor"],
      description: "Muestra el color de un rol."
    },
    users: {
      short: "roleusers",
      slash: "role users",
      slashId: "1481436920075649283",
      usage: ".roleusers <@rol>",
      aliases: ["rusers", "usersrole"],
      description: "Lista usuarios con un rol."
    },
    add: {
      short: "roleadd",
      slash: "role add",
      slashId: "1481436920075649283",
      usage: ".roleadd <@usuario> <@rol>",
      aliases: ["addrole", "radd"],
      description: "Añade un rol a un usuario."
    },
    remove: {
      short: "roleremove",
      slash: "role remove",
      slashId: "1481436920075649283",
      usage: ".roleremove <@usuario> <@rol>",
      aliases: ["removerole", "rremove"],
      description: "Quita un rol a un usuario."
    },
    rename: {
      short: null,
      slash: "role rename",
      slashId: "1481436920075649283",
      usage: null,
      aliases: [],
      description: "Renombra un rol."
    },
    hoist: {
      short: null,
      slash: "role hoist",
      slashId: "1481436920075649283",
      usage: null,
      aliases: [],
      description: "Activa o desactiva si un rol se muestra separado en la lista."
    },
    mentionable: {
      short: null,
      slash: "role mentionable",
      slashId: "1481436920075649283",
      usage: null,
      aliases: [],
      description: "Activa o desactiva si un rol es mencionable por todos."
    }
  },
  canal: {
    info: {
      short: "channelinfo",
      slash: "channel info",
      slashId: "1481436920075649280",
      usage: ".channelinfo [#canal]",
      aliases: ["chinfo", "cinfo"],
      description: "Muestra información de un canal."
    },
    rename: {
      short: "channelrename",
      slash: "channel rename",
      slashId: "1481436920075649280",
      usage: ".channelrename <#canal> <nombre>",
      aliases: ["chrename", "crename"],
      description: "Renombra un canal."
    },
    lock: {
      short: "channellock",
      slash: "channel lock",
      slashId: "1481436920075649280",
      usage: ".channellock [#canal]",
      aliases: ["chlock", "lockdown"],
      description: "Bloquea un canal para usuarios normales."
    },
    unlock: {
      short: "channelunlock",
      slash: "channel unlock",
      slashId: "1481436920075649280",
      usage: ".channelunlock [#canal]",
      aliases: ["chunlock", "cunlock"],
      description: "Abre un canal bloqueado."
    },
    slowmode: {
      short: "channelslowmode",
      slash: "channel slowmode",
      slashId: "1481436920075649280",
      usage: ".channelslowmode <tiempo> [#canal]",
      aliases: ["chslowmode", "slowmode", "sm"],
      description: "Establece el slowmode de un canal (0 para desactivar, máx 6h)."
    },
    nuke: {
      short: "channelnuke",
      slash: "channel nuke",
      slashId: "1481436920075649280",
      usage: ".channelnuke [#canal]",
      aliases: ["chnuke", "nuke"],
      description: "Recrea el canal borrando todos sus mensajes."
    },
    clone: {
      short: "channelclone",
      slash: "channel clone",
      slashId: "1481436920075649280",
      usage: ".channelclone [#canal]",
      aliases: ["chclone", "clonechannel"],
      description: "Clona un canal con su configuración."
    },
    permit: {
      short: "channelpermit",
      slash: "channel permit",
      slashId: "1481436920075649280",
      usage: ".channelpermit <@usuario> [#canal]",
      aliases: ["chpermit", "permit"],
      description: "Da acceso a un usuario en un canal."
    },
    deny: {
      short: "channeldeny",
      slash: "channel deny",
      slashId: "1481436920075649280",
      usage: ".channeldeny <@usuario> [#canal]",
      aliases: ["chdeny", "deny"],
      description: "Quita el acceso a un usuario en un canal."
    },
    hide: {
      short: "channelhide",
      slash: "channel hide",
      slashId: "1481436920075649280",
      usage: ".channelhide [#canal]",
      aliases: ["chhide", "hidechannel"],
      description: "Oculta un canal a @everyone."
    }
  },
  diversion: {
    opinion: {
      short: "opinion",
      slash: "fun opinion",
      slashId: "1481436920075649281",
      usage: ".opinion <tema>",
      aliases: ["op", "opina"],
      description: "Pide mi opinión sin filtro sobre algo."
    },
    critica: {
      short: "critica",
      slash: "fun critica",
      slashId: "1481436920075649281",
      usage: ".critica <tema>",
      aliases: ["criticar", "critique"],
      description: "Te doy una crítica despiadada de algo."
    },
    excusa: {
      short: "excusa",
      slash: "fun excusa",
      slashId: "1481436920075649281",
      usage: ".excusa <situacion>",
      aliases: ["coartada", "excuse"],
      description: "Genera una excusa ridícula pero creativa."
    },
    teoria: {
      short: "teoria",
      slash: "fun teoria",
      slashId: "1481436920075649281",
      usage: ".teoria <tema>",
      aliases: ["conspira", "conspiracion"],
      description: "Una teoría conspirativa sobre cualquier cosa."
    },
    roast: {
      short: "roast",
      slash: "fun roast",
      slashId: "1481436920075649281",
      usage: ".roast <@usuario>",
      aliases: ["quemar", "burn"],
      description: "Critica despiadadamente a un usuario."
    }
  }
};

const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

const data = {
  data: new CommandBuilder({
    name: "help",
    description: "Muestra la lista de comandos disponibles",
    as_prefix: true,
    as_slash: true
  }),

  async code(ctx) {
    try {
      const isSlash = Boolean(ctx.interaction);
      const authorId = ctx.user?.id || ctx.author?.id;

      const prefixCache = require("../utils/prefixCache");
      const guildId = ctx.guild?.id;
      const prefix = (guildId && prefixCache.get(guildId)) || ".";

      const formatCommand = (cmd) =>
        cmd.short
          ? (isSlash ? `</${cmd.slash}:${cmd.slashId}>` : `${prefix}${cmd.short}`)
          : `</${cmd.slash}:${cmd.slashId}>`;

      const formatSelectLabel = (cmd) =>
        cmd.slash
          .split(" ")
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

      const buildCommandList = (category) =>
        Object.values(COMMANDS[category]).map(formatCommand).join("\n");

      const buildCategoryRows = (active) => {
        const rows = [];
        const chunkSize = 5;
        for (let i = 0; i < CATEGORIES.length; i += chunkSize) {
          const chunk = CATEGORIES.slice(i, i + chunkSize);
          rows.push(
            new ActionRowBuilder().addComponents(
              chunk.map(cat =>
                new ButtonBuilder()
                  .setCustomId(`help_${cat}`)
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
            .setCustomId(`select_${category}`)
            .setPlaceholder("Selecciona un comando")
            .addOptions(
              Object.entries(COMMANDS[category]).map(([key, cmd]) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(formatSelectLabel(cmd))
                  .setValue(`${category}_${key}`)
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
            .setURL("https://discord.gg/b8AKKaNWU6")
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

      const message = await ctx.send({
        flags: MessageFlags.IsComponentsV2,
        components: [buildContainer("utilidad"), buildDeleteRow()],
        allowedMentions: { repliedUser: false }
      });

      const collectorOptions = {
        time: COLLECTOR_TIMEOUT,
        filter: (i) => i.user.id === authorId
      };

      const buttonCollector = message.createMessageComponentCollector({
        ...collectorOptions,
        componentType: ComponentType.Button
      });

      const selectCollector = message.createMessageComponentCollector({
        ...collectorOptions,
        componentType: ComponentType.StringSelect
      });

      buttonCollector.on("end", async () => {
        try {
          await message.edit({
            flags: MessageFlags.IsComponentsV2,
            components: [buildContainer("utilidad")]
          });
        } catch {}
      });

      buttonCollector.on("collect", async (interaction) => {
        if (interaction.customId === "help_delete") {
          buttonCollector.stop();
          selectCollector.stop();
          return interaction.message.delete();
        }

        const category = interaction.customId.split("_")[1];
        await interaction.update({
          flags: MessageFlags.IsComponentsV2,
          components: [buildContainer(category), buildDeleteRow()]
        });
      });

      selectCollector.on("collect", async (interaction) => {
        const [category, key] = interaction.values[0].split("_");
        const cmd = COMMANDS[category][key];

        const embed = new EmbedBuilder()
          .setColor("Red")
          .setTitle(formatSelectLabel(cmd))
          .addFields(
            { name: "Uso", value: (isSlash || !cmd.short) ? `</${cmd.slash}:${cmd.slashId}>` : cmd.usage },
            { name: "Descripción", value: cmd.description },
            ...(cmd.aliases.length
              ? [{ name: "Alias", value: cmd.aliases.join(", ") }]
              : [])
          );

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      });

    } catch (error) {
      console.error(error);
      await ctx.send("Error en help");
    }
  }
};

module.exports = { data };