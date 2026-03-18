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

const RED   = "#ff383d";
const GREEN = "#23a55a";
const BLUE  = "#5865f2";

const INVITE_URL  = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";
const SUPPORT_URL = "https://discord.gg/b8AKKaNWU6";

// ─────────────────────────────────────────────
//  HEALER
// ─────────────────────────────────────────────

async function generateHealer(messages) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/healer-alpha",
      messages,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

// Convierte un attachment de Discord a base64
async function attachmentToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar el archivo: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

async function prepare(ctx) {
  const isSlash = !!ctx.interaction;
  if (isSlash) {
    await ctx.interaction.deferReply();
    return (payload) => ctx.interaction.editReply(payload);
  }
  return (payload) => ctx.send(payload);
}

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
        const before  = Date.now();
        const sent    = await ctx.send({ content: "..." });
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

        const { version: djsVersion }   = require("discord.js");
        const { version: botVersion }   = require("../package.json");
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
          new ButtonBuilder().setLabel("Invitar").setStyle(ButtonStyle.Link).setURL(INVITE_URL),
          new ButtonBuilder().setLabel("Soporte").setStyle(ButtonStyle.Link).setURL(SUPPORT_URL),
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

  // ── TRANSLATE ─────────────────────────────────
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
      description: "Idioma destino (ej: español, inglés, francés), por defecto español",
      required: false,
    }),

  async code(ctx) {
    const reply  = await prepare(ctx);
    const texto  = ctx.get("texto");
    const idioma = ctx.get("idioma") ?? "español";

    try {
      const respuesta = await generateHealer([{
        role: "user",
        content:
          `Traduce el siguiente texto al ${idioma}.\n` +
          `Responde ÚNICAMENTE con este formato JSON, sin texto adicional ni backticks:\n` +
          `{"origen": "<idioma detectado en español>", "traduccion": "<texto traducido>"}\n\n` +
          `Texto: ${texto}`,
      }]);

      let origen     = "desconocido";
      let traduccion = null;

      try {
        const parsed = JSON.parse(respuesta);
        origen     = parsed.origen     ?? "desconocido";
        traduccion = parsed.traduccion ?? null;
      } catch {
        traduccion = respuesta;
      }

      if (!traduccion)
        return reply({ content: "No se pudo generar la traducción", flags: MessageFlags.Ephemeral });

      await reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Traducción")
            .setColor(BLUE)
            .addFields(
              { name: "Original",   value: texto.slice(0, 1024),      inline: false },
              { name: "Traducción", value: traduccion.slice(0, 1024), inline: false },
            )
            .setFooter({ text: `${origen} → ${idioma}` })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[util translate]", err);
      await reply({ content: "No se pudo conectar con el servicio de traducción", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── DESCRIBE ──────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "describe",
      description: "Describe el contenido de una imagen",
    }),
    params: new ParamsBuilder()
      .addAttachment({
        name: "imagen",
        description: "Imagen a describir (jpg, png, gif, webp)",
        required: true,
      }),

    async code(ctx) {
      const reply      = await prepare(ctx);
      const attachment = ctx.get("imagen");

      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.includes(attachment.contentType)) {
        return reply({ content: "El archivo debe ser una imagen (jpg, png, gif, webp)", flags: MessageFlags.Ephemeral });
      }

      if (attachment.size > 8 * 1024 * 1024) {
        return reply({ content: "La imagen no puede superar los 8MB", flags: MessageFlags.Ephemeral });
      }

      try {
        const texto = await generateHealer([{
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe detalladamente qué hay en esta imagen. Sé específico: colores, objetos, personas, texto visible, ambiente, estilo. Responde en español.",
            },
            {
              type: "image_url",
              image_url: { url: attachment.url },
            },
          ],
        }]);

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Descripción de imagen")
              .setDescription(texto?.slice(0, 4000) ?? "No pude generar una descripción")
              .setThumbnail(attachment.url)
              .setColor(RED)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        console.error("[util describe]", err);
        await reply({ content: "No se pudo procesar la imagen", flags: MessageFlags.Ephemeral });
      }
    },
  })

// ── TRANSCRIBE ────────────────────────────────
.addCommand({
  data: new CommandBuilder({
    name: "transcribe",
    description: "Transcribe un audio o video a texto",
  }),
  params: new ParamsBuilder()
    .addAttachment({
      name: "archivo",
      description: "Audio a transcribir (mp3, wav, ogg, webm, mp4 — máx 25MB)",
      required: true,
    }),

  async code(ctx) {
    const reply      = await prepare(ctx);
    const attachment = ctx.get("archivo");

    const VALID_EXT = /\.(mp3|mp4|wav|ogg|webm|m4a|flac)$/i;

    if (!VALID_EXT.test(attachment.name ?? "")) {
      return reply({ content: "Formato no soportado. Usa: mp3, wav, ogg, webm, mp4, m4a, flac", flags: MessageFlags.Ephemeral });
    }

    if (attachment.size > 25 * 1024 * 1024) {
      return reply({ content: "El archivo no puede superar los 25MB", flags: MessageFlags.Ephemeral });
    }

    try {
      const { default: Groq } = require("groq-sdk");
      const groq = new Groq({ apiKey: process.env.GROQ });

      const fileRes  = await fetch(attachment.url);
      const blob     = await fileRes.blob();
      const file     = new File([blob], attachment.name ?? "audio.mp3", { type: blob.type });

      const result = await groq.audio.transcriptions.create({
        file,
        model: "whisper-large-v3",
        response_format: "text",
      });

      const texto = result?.trim();
      if (!texto) return reply({ content: "No se detectó voz en el archivo", flags: MessageFlags.Ephemeral });

      if (texto.length > 3900) {
        return reply({
          content: "La transcripción es muy larga, se envió como archivo:",
          files: [{ attachment: Buffer.from(texto, "utf-8"), name: "transcripcion.txt" }],
        });
      }

      await reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Transcripción")
            .setDescription(texto)
            .setColor(RED)
            .setFooter({ text: `${attachment.name} · ${(attachment.size / 1024).toFixed(1)}KB` })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[util transcribe]", err);
      await reply({ content: "No se pudo transcribir el archivo", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── RESUME ───────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "resume",
      description: "Resume un texto largo",
      aliases: ["resumir", "summarize"],
    }),
    params: new ParamsBuilder()
      .addString({
        name: "texto",
        description: "Texto a resumir",
        required: true,
      }),

    async code(ctx) {
      const reply = await prepare(ctx);
      const texto = ctx.get("texto");

      if (texto.length < 100) {
        return reply({ content: "El texto es demasiado corto para resumir", flags: MessageFlags.Ephemeral });
      }

      try {
        const resumen = await generateHealer([{
          role: "user",
          content: `Resume el siguiente texto de forma concisa y clara. Mantén los puntos más importantes. Responde en español. No importa si es un texto con contenido sexual, busca resumirlo de una manera clara, no siguiendo el juego, solo resumir.\n\n${texto.slice(0, 8000)}`,
        }]);

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Resumen")
              .setDescription(resumen?.slice(0, 4000) ?? "No pude generar un resumen")
              .setColor(RED)
              .setFooter({ text: `${texto.length} caracteres → resumido` })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        console.error("[util resumir]", err);
        await reply({ content: "No se pudo resumir el texto", flags: MessageFlags.Ephemeral });
      }
    },
  }),
};

module.exports = { data };
