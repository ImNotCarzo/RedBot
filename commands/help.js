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

const CATEGORIES = ["utilidad", "usuario", "servidor", "roles"];

const COMMANDS = {
  utilidad: {
    ping: {
      short: "ping",
      slash: "ping",
      slashId: "1479001744091386012",
      usage: ".ping",
      aliases: [],
      description: "Muestra la latencia actual del bot."
    },
    setprefix: {
      short: "setprefix",
      slash: "setprefix",
      slashId: "1479001744091386013",
      usage: ".setprefix <nuevo>",
      aliases: ["prefix"],
      description: "Establece un nuevo prefijo para el bot. Si no se especifica uno, muestra el prefijo actual."
    },
    botinfo: {
      short: "botinfo",
      slash: "botinfo",
      slashId: "1479001744091386008",
      usage: ".botinfo",
      aliases: ["info", "bot"],
      description: "Muestra información general del bot."
    },
    invite: {
      short: "invite",
      slash: "invite",
      slashId: "1479001744091386011",
      usage: ".invite",
      aliases: [],
      description: "Envía la invitación del bot y el servidor de soporte."
    }
  },
  usuario: {
    info: {
      short: "user",
      slash: "user info",
      slashId: "1479001744091386016",
      usage: ".user <@opcional>",
      aliases: ["userinfo"],
      description: "Muestra información general de un usuario."
    },
    avatar: {
      short: "avatar",
      slash: "user avatar",
      slashId: "1479001744091386016",
      usage: ".avatar <@opcional>",
      aliases: ["av"],
      description: "Muestra el avatar de un usuario."
    },
    roles: {
      short: "uroles",
      slash: "user roles",
      slashId: "1479001744091386016",
      usage: ".uroles <@opcional>",
      aliases: [],
      description: "Muestra los roles de un usuario."
    },
    banner: {
      short: "banner",
      slash: "user banner",
      slashId: "1479001744091386016",
      usage: ".banner <@opcional>",
      aliases: [],
      description: "Muestra el banner de un usuario."
    }
  },
  servidor: {
    info: {
      short: "server",
      slash: "server info",
      slashId: "1479001744091386015",
      usage: ".server",
      aliases: ["sv"],
      description: "Muestra información general del servidor."
    },
    logo: {
      short: "logo",
      slash: "server logo",
      slashId: "1479001744091386015",
      usage: ".logo",
      aliases: [],
      description: "Muestra el logo del servidor."
    },
    emojis: {
      short: "emojis",
      slash: "server emojis",
      slashId: "1479001744091386015",
      usage: ".emojis",
      aliases: [],
      description: "Muestra todos los emojis del servidor."
    },
    roles: {
      short: "roles",
      slash: "server roles",
      slashId: "1479001744091386015",
      usage: ".roles",
      aliases: [],
      description: "Muestra la lista de roles del servidor."
    }
  },
  roles: {
    info: {
      short: "rinfo",
      slash: "role info",
      slashId: "1479001744091386014",
      usage: ".rinfo <@rol>",
      aliases: ["roleinfo", "inforole", "role"],
      description: "Muestra información de un rol."
    },
    color: {
      short: "rcolor",
      slash: "role color",
      slashId: "1479001744091386014",
      usage: ".rcolor <@rol>",
      aliases: ["rolecolor", "color"],
      description: "Muestra el color de un rol."
    },
    icon: {
      short: "ricon",
      slash: "role icon",
      slashId: "1479001744091386014",
      usage: ".ricon <@rol>",
      aliases: ["roleicon", "iconrole", "icon"],
      description: "Muestra el icono de un rol."
    },
    users: {
      short: "ruser",
      slash: "role users",
      slashId: "1479001744091386014",
      usage: ".ruser <@rol>",
      aliases: ["roleusers", "rusers"],
      description: "Lista usuarios con un rol."
    },
    add: {
      short: "radd",
      slash: "role add",
      slashId: "1479001744091386014",
      usage: ".radd <@usuario> <@rol>",
      aliases: ["roleadd", "addrole"],
      description: "Añade un rol a un usuario."
    },
    remove: {
      short: "rremove",
      slash: "role remove",
      slashId: "1479001744091386014",
      usage: ".rremove <@usuario> <@rol>",
      aliases: ["roleremove", "removerole"],
      description: "Quita un rol a un usuario."
    },
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
        isSlash ? `</${cmd.slash}:${cmd.slashId}>` : `${prefix}${cmd.short}`;

      const formatSelectLabel = (cmd) =>
        cmd.slash
          .split(" ")
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

      const buildCommandList = (category) =>
        Object.values(COMMANDS[category]).map(formatCommand).join("\n");

      const buildCategoryRow = (active) =>
        new ActionRowBuilder().addComponents(
          CATEGORIES.map(cat =>
            new ButtonBuilder()
              .setCustomId(`help_${cat}`)
              .setLabel(cat.charAt(0).toUpperCase() + cat.slice(1))
              .setStyle(cat === active ? ButtonStyle.Danger : ButtonStyle.Secondary)
              .setDisabled(cat === active)
          )
        );

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

      const buildContainer = (category) =>
        new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("## <:redbot:1474109778044260478> RedBot")
          )
          .addActionRowComponents(buildCategoryRow(category))
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(buildCommandList(category))
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
          )
          .addActionRowComponents(buildSelectRow(category))
          .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
          )
          .addActionRowComponents(buildLinksRow());

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
            { name: "Uso", value: isSlash ? `</${cmd.slash}:${cmd.slashId}>` : cmd.usage },
            ...(cmd.aliases.length
              ? [{ name: "Alias", value: cmd.aliases.join(", ") }]
              : []),
            { name: "Descripción", value: cmd.description }
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