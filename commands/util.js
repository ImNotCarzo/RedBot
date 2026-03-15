const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("erine");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const prefixCache = require("../utils/prefixCache");
const { deleteConversacion } = require("../utils/askMemory");

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

const RED    = "#ff383d";
const GREEN  = "#23a55a";

const INVITE_URL    = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";
const SUPPORT_URL   = "https://discord.gg/b8AKKaNWU6";

// ─────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────

const data = {
  data: new GroupBuilder({
    name: "util",
    description: "Comandos de utilidad general",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })

  // ── PING ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "ping",
      description: "Muestra la latencia del bot",
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      try {
        const before = Date.now();
        const sent   = await ctx.send({ content: "..." });
        const msgPing = Date.now() - before;
        const apiPing = ctx.bot?.ws?.ping ?? 0;

        await sent.edit({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setTitle("Pong!")
              .setDescription(
                `> **Mensaje:** \`${msgPing}ms\`\n` +
                `> **API:** \`${apiPing}ms\``
              )
              .setColor(RED),
          ],
        });
      } catch (err) {
        console.error("[util ping]", err);
        await ctx.send({ content: "Algo salió mal", flags: MessageFlags.Ephemeral });
      }
    },
  })

    // ── BOTINFO ───────────────────────────────────
.addCommand({
  data: new CommandBuilder({
    name: "botinfo",
    description: "Información general del bot",
    aliases: ["bot", "info"],
  }),
  params: new ParamsBuilder(),

  async code(ctx) {
    try {
      const bot = ctx.bot;
      if (!bot?.user) return ctx.send({ content: "Error al obtener la información", flags: MessageFlags.Ephemeral });

      const { version: djsVersion } = require("discord.js");
      const { version: botVersion } = require("../package.json");
      const { version: erineVersion } = require("../node_modules/erine/package.json");

      const formatUptime = (ms) => {
        const s = Math.floor(ms / 1000) % 60;
        const m = Math.floor(ms / 60000) % 60;
        const h = Math.floor(ms / 3600000) % 24;
        const d = Math.floor(ms / 86400000);
        return `${d}d/${h}h/${m}m/${s}s`;
      };

      const servers   = bot.guilds.cache.size;
      const users     = bot.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
      const createdAt = Math.floor(bot.user.createdTimestamp / 1000);

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: bot.user.username, iconURL: bot.user.displayAvatarURL() })
            .setFields(
              {
                name: "Básico",
                value: `> **ID:** \`${bot.user.id}\`\n> **Creación:** <t:${createdAt}:d>\n> **Versión:** \`${botVersion}\``,
              },
              {
                name: "Estadísticas",
                value: `> **Servidores:** \`${servers}\`\n> **Usuarios:** \`${users}\`\n> **Tiempo activo:** \`${formatUptime(bot.uptime)}\``,
              },
              {
                name: "Extra",
                value: `> **Creador:** \`carzo.\`\n> **Node.js:** \`${process.version}\`\n> **discord.js:** \`v${djsVersion}\`\n> **Erine:** \`v${erineVersion}\``,
              },
            )
            .setColor(RED)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[util botinfo]", err);
      await ctx.send({ content: "Algo salió mal", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── INVITE ────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "invite",
      description: "Obtén los links de invitación del bot",
      aliases: ["inv"],
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      try {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Invitar")
            .setStyle(ButtonStyle.Link)
            .setURL(INVITE_URL),
          new ButtonBuilder()
            .setLabel("Soporte")
            .setStyle(ButtonStyle.Link)
            .setURL(SUPPORT_URL),
        );

        await ctx.send({ content: INVITE_URL, components: [row] });
      } catch (err) {
        console.error("[util invite]", err);
        await ctx.send({ content: "Algo salió mal", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── SETPREFIX ─────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "setprefix",
      description: "Cambia o muestra el prefix del bot en este servidor",
    }),
    params: new ParamsBuilder()
      .addString({
        name: "nuevo",
        description: "Nuevo prefix (omitir para ver el actual)",
        required: false,
      }),

    async code(ctx) {
      try {
        if (!ctx.guild)
          return ctx.send({ content: "Este comando solo funciona en servidores", flags: MessageFlags.Ephemeral });

        if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
          return ctx.send({ content: "Necesitás el permiso `Administrator`", flags: MessageFlags.Ephemeral });

        const nuevo = ctx.get("nuevo");

        // Sin argumento → mostrar prefix actual
        if (!nuevo) {
          const config = await GuildConfig.findOne({ guildId: ctx.guild.id });
          const prefix = config?.prefix ?? ".";
          return ctx.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("Prefix actual")
                .setDescription(`\`${prefix}\``)
                .setColor(RED),
            ],
          });
        }

        if (nuevo.length > 3)
          return ctx.send({ content: "El prefix no puede tener más de 3 caracteres", flags: MessageFlags.Ephemeral });

        await GuildConfig.findOneAndUpdate(
          { guildId: ctx.guild.id },
          { prefix: nuevo },
          { upsert: true }
        );

        prefixCache.set(ctx.guild.id, nuevo);

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Prefix actualizado")
              .setDescription(`Nuevo prefix: \`${nuevo}\``)
              .setColor(GREEN),
          ],
        });
      } catch (err) {
        console.error("[util setprefix]", err);
        await ctx.send({ content: "No se pudo cambiar el prefix", flags: MessageFlags.Ephemeral });
      }
    },
  })
    
    // ── ASKRESET ──────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "askreset",
      description: "Limpia tu historial de conversación con la IA",
      aliases: ["reset"],
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      const userId = ctx.user?.id ?? ctx.author?.id;
      deleteConversacion(userId);
      await ctx.send({ content: "Historial borrado" });
    },
  })
    
  // ── TRANSLATE ──────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "translate",
    description: "Traduce texto a otro idioma",
    aliases: ["traducir", "trans"],
  }),
  params: new ParamsBuilder()
    .addString({
      name: "texto",
      description: "Texto a traducir",
      required: true,
    })
    .addString({
      name: "idioma",
      description: "Idioma destino (ej: es, en, fr, de) — por defecto español",
      required: false,
    }),

  async code(ctx) {
    const texto  = ctx.get("texto");
    const idioma = ctx.get("idioma") ?? "es";

    if (!texto) {
      const paramerror = new EmbedBuilder()
        .setAuthor({ name: "Comando Translate", iconURL: ctx.bot.user.displayAvatarURL() })
        .setDescription(
          `**Usos:**\nTraduce un texto a cualquier idioma` +
          `\n\n**Aliases:**\n\`traducir\`, \`trans\`` +
          `\n\`\`\`js\n.translate <texto> [idioma]\nEjemplo: .translate כלב es\`\`\``
        )
        .setColor(RED);
      return ctx.send({ embeds: [paramerror] });
    }

    try {
      const response = await fetch(
  `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=auto|${idioma}`
);

const data = await response.json();

if (data.responseStatus !== 200) {
  return ctx.send({
    content: `No se pudo traducir: \`${data.responseDetails}\``,
    flags: MessageFlags.Ephemeral,
  });
}

const traduccion   = data.responseData.translatedText;
const idiomaOrigen = data.matches?.[0]?.source ?? "auto";

      const embed = new EmbedBuilder()
        .setTitle("Traducción")
        .setColor(BLUE)
        .addFields(
          { name: "Original",    value: texto.slice(0, 1024),      inline: false },
          { name: "Traducción",  value: traduccion.slice(0, 1024), inline: false },
        )
        .setFooter({ text: `${idiomaOrigen} → ${idioma}` })
        .setTimestamp();

      await ctx.send({ embeds: [embed] });

    } catch (err) {
      console.error("[util translate]", err);
      await ctx.send({ content: "No se pudo conectar con el servicio de traducción", flags: MessageFlags.Ephemeral });
    }
  },
})
};

module.exports = { data };
