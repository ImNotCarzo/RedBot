const { EmbedBuilder, MessageFlags, version: djsVersion } = require("discord.js");
const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { deleteConversacion, generateText, generateVision, generateTranscription } = require("../../src/ai");
const { extractFirstUrl, getGuildUploadLimitBytes, resolveVideoMetadata, downloadMeta, buildDownloadV2Payload } = require("../../src/downloader");
const { RED, GREEN } = require("../../src/config");
const { getPrefix, setPrefix, setAfk, sendLog } = require("../../src/guild");
const {
  Logger,
  THINKING_TEXT,
  fetchWithTimeout,
  prepareReply,
  noGuildReply,
  handleCommandError,
  INVITE_URL,
  SUPPORT_URL,
  broadcastDm,
  buildDmAllEmbed,
  buildDmAllLogEmbed,
} = require("../../src/runtime");
const {
  createContainer,
  addHeaderSection,
  addSeparator,
  addTextBlock,
  addLinkButtons,
  addAttachmentFile,
  clipV2Text,
  buildSimpleContainer,
  buildImageViewContainer,
  buildV2Payload,
} = require("../../src/v2");
const { version: botVersion } = require("../../package.json");
const { fetchPublic, readBodyLimited } = require("../../src/security");
const { createReminder } = require("../../src/reminders");
const { parseDuration } = require("../../src/moderation");

let graloniumVersion = "0.2.0";
try { graloniumVersion = require("gralonium/package.json").version; } catch {}

const log = new Logger("CMD_UTIL", process.env.LOG_LEVEL);

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
        const sent    = await ctx.send(buildV2Payload(buildSimpleContainer({ body: THINKING_TEXT, color: RED })));
        const msgPing = Date.now() - before;
        const apiPing = ctx.bot?.ws?.ping ?? 0;

        await sent.edit(
          buildV2Payload(
            buildSimpleContainer({
              title: "Pong!",
              body: `> **Mensaje:** \`${msgPing}ms\`\n> **API:** \`${apiPing}ms\``,
              color: RED,
            })
          )
        );
      } catch (err) {
        log.error("[util ping]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
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

        const botInfoContainer = createContainer(RED);
        addHeaderSection(
          botInfoContainer,
          [
            `## ${clipV2Text(bot.user.username, 100)}`,
            `### Básico\n> **ID:** \`${bot.user.id}\`\n> **Creación:** <t:${createdAt}:d>\n> **Versión:** \`${botVersion}\``,
          ],
          bot.user.displayAvatarURL({ size: 256 })
        );
        addSeparator(botInfoContainer);
        addTextBlock(
          botInfoContainer,
          `### Estadísticas\n> **Servidores:** \`${servers}\`\n> **Usuarios:** \`${users}\`\n> **Tiempo activo:** \`${formatUptime(bot.uptime)}\``
        );
        addSeparator(botInfoContainer);
        addTextBlock(
          botInfoContainer,
          `### Extra\n> **Creador:** \`carzo.\`\n> **Node.js:** \`${process.version}\`\n> **discord.js:** \`v${djsVersion}\`\n> **Gralonium:** \`v${graloniumVersion}\``
        );
        addSeparator(botInfoContainer);
        addLinkButtons(botInfoContainer, [
          { label: "Invitar", url: INVITE_URL },
          { label: "Soporte", url: SUPPORT_URL },
        ]);

        await ctx.send(buildV2Payload(botInfoContainer));
      } catch (err) {
        log.error("[util botinfo]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
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
        const container = buildSimpleContainer({
          title: ctx.bot?.user?.username ?? "RedBot",
          body: "Invítame a tu servidor o únete al servidor de soporte usando los enlaces de abajo.",
          thumbnailUrl: ctx.bot?.user?.displayAvatarURL?.({ size: 256 }) ?? null,
          color: RED,
          links: [
            { label: "Invitar", url: INVITE_URL },
            { label: "Soporte", url: SUPPORT_URL },
          ],
        });
        await ctx.send(buildV2Payload(container));
      } catch (err) {
        log.error("[util invite]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
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

    plugins: [Plugins.hasPerms("Administrator")],

    async code(ctx) {
      try {
        if (!ctx.guild)
          return ctx.send({ content: "Este comando solo funciona en servidores", flags: MessageFlags.Ephemeral });

        const nuevo = ctx.get("nuevo");

        if (!nuevo) {
          const prefix = await getPrefix(ctx.guild.id);
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

        await setPrefix(ctx.guild.id, nuevo);

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Prefix actualizado")
              .setDescription(`Nuevo prefix: \`${nuevo}\``)
              .setColor(GREEN),
          ],
        });
      } catch (err) {
        log.error("[util setprefix]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
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
      await ctx.send({ content: "Tu historial de conversación fue reiniciado." });
    },
  })

  // ── AFK ───────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "afk",
      description: "Ponte en ausente",
      aliases: ["ausente"],
    }),
    params: new ParamsBuilder()
      .addString({
        name: "razon",
        description: "Motivo",
        required: false,
      }),

    async code(ctx) {
      try {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);

        const invoker = ctx.user ?? ctx.author;
        const razon = ctx.get("razon")?.trim() || "AFK";

        await setAfk(ctx.guild.id, invoker.id, razon);

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setAuthor({ name: invoker.username, iconURL: invoker.displayAvatarURL({ size: 128 }) })
              .setDescription(`Ahora estás **AFK**: ${razon}`)
              .setColor(RED)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[util afk]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
      }
    },
  })

  // ── JUMBO ─────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "jumbo",
      description: "Muestra un emoji en tamaño grande",
      aliases: ["emojijumbo", "bigemoji"],
    }),
    params: new ParamsBuilder()
      .addString({
        name: "emoji",
        description: "Emoji personalizado o estándar a ampliar",
        required: true,
      }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      try {
        const raw = (ctx.get("emoji") ?? "").trim();
        if (!raw) {
          return ctx.send({ content: "Debes ingresar un emoji válido", flags: MessageFlags.Ephemeral });
        }

        const customMatch = raw.match(/<(a)?:([a-zA-Z0-9_]+):(\d{17,20})>/);
        if (customMatch) {
          const animated = Boolean(customMatch[1]);
          const name = customMatch[2];
          const id = customMatch[3];
          const ext = animated ? "gif" : "png";
          const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=4096&quality=lossless`;

          return ctx.send(
            buildV2Payload(
              buildImageViewContainer({
                title: `:${name}:`,
                imageUrl: url,
                footer: `ID: ${id}`,
                color: RED,
              })
            )
          );
        }

        const chars = [...raw];
        if (!chars.length || chars.length > 10 || /^[a-zA-Z0-9\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]+$/.test(raw)) {
          return ctx.send({ content: "Debes ingresar un emoji válido", flags: MessageFlags.Ephemeral });
        }

        const rawCps = chars.map((c) => c.codePointAt(0).toString(16));
        const filteredCps = rawCps.includes("200d") ? rawCps : rawCps.filter((cp) => cp !== "fe0f");
        if (!filteredCps.length) {
          return ctx.send({ content: "Debes ingresar un emoji válido", flags: MessageFlags.Ephemeral });
        }

        const twemojiUrl = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${filteredCps.join("-")}.png`;
        const checkRes = await fetchWithTimeout(twemojiUrl, { method: "HEAD" }, 5000).catch(() => null);
        if (!checkRes?.ok) {
          return ctx.send({ content: "No pude encontrar ese emoji", flags: MessageFlags.Ephemeral });
        }

        const highResUrl = `https://emojicdn.elk.sh/${encodeURIComponent(raw)}?style=twitter`;

        return ctx.send(
          buildV2Payload(
            buildImageViewContainer({
              title: `Emoji ${raw}`,
              imageUrl: highResUrl,
              color: RED,
            })
          )
        );
      } catch (err) {
        log.error("[util jumbo]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
      }
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
      description: "Idioma destino (ej: es, en, fr, de) por defecto español",
      required: false,
      autocomplete: true,
    }),

  async code(ctx) {
    const reply  = await prepareReply(ctx);
    const texto  = ctx.get("texto");
    const idioma = ctx.get("idioma") ?? "es";

    try {
      const { translate } = require("@vitalets/google-translate-api");
      const result = await translate(texto, { to: idioma });

      const origen     = result.raw?.src ?? "auto";
      const traduccion = result.text;

      if (!traduccion)
        return reply({ content: "No se pudo generar la traducción", flags: MessageFlags.Ephemeral });

      const translateContainer = createContainer(RED);
      addTextBlock(translateContainer, "## Traducción");
      addSeparator(translateContainer);
      addTextBlock(
        translateContainer,
        `**Original:**\n${clipV2Text(texto, 1500)}\n\n**Traducción:**\n${clipV2Text(traduccion, 1800)}`
      );
      addTextBlock(translateContainer, `-# ${origen} → ${idioma}`, 210);

      await reply(buildV2Payload(translateContainer));
    } catch (err) {
      log.error("[util translate]", { err: err?.message ?? String(err) });
      if (err.name === "TooManyRequestsError")
        return reply({ content: "Google Translate está saturado, intenta en unos segundos", flags: MessageFlags.Ephemeral });
      await reply({ content: "No se pudo conectar con el servicio de traducción", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── DOWNLOAD ──────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "download",
      description: "Descarga un video desde un enlace (TikTok, X, Instagram, Reddit, etc.)",
      aliases: ["dl", "video", "bajar"],
    }),
    params: new ParamsBuilder()
      .addString({
        name: "url",
        description: "Enlace del video a descargar",
        required: true,
      }),

    async code(ctx) {
      const reply = await prepareReply(ctx, { thinking: true });
      const rawInput = ctx.get("url");
      const url = extractFirstUrl(rawInput);

      if (!url) {
        return reply({ content: "Debes proporcionar un enlace válido (`https://...`)", flags: MessageFlags.Ephemeral });
      }

      try {
        const meta = await resolveVideoMetadata(url);
        if (!meta?.videoUrl) {
          log.warn("[util download] sin video extraíble", { url });
          return reply({
            content: "No pude extraer ningún video de ese enlace. Verifica que sea público y contenga un video.",
            flags: MessageFlags.Ephemeral,
          });
        }

        const maxBytes = getGuildUploadLimitBytes(ctx.guild);
        const downloadResult = await downloadMeta(meta, maxBytes);
        const payload = buildDownloadV2Payload(meta, downloadResult);

        try {
          await reply(payload);
        } catch (sendErr) {
          if (sendErr?.code === 40005 || sendErr?.status === 413) {
            const fallbackPayload = buildDownloadV2Payload(meta, {
              tooLarge: true,
              size: downloadResult.size,
            });
            return await reply(fallbackPayload);
          }
          throw sendErr;
        }
      } catch (err) {
        log.error("[util download]", { err: err?.message ?? String(err) });
        return reply({
          content: "No se pudo descargar el video en este momento. Intenta con otro enlace.",
          flags: MessageFlags.Ephemeral,
        });
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
      const reply      = await prepareReply(ctx, { thinking: true });
      const attachment = ctx.get("imagen");
      if (!attachment) {
        return reply({ content: "Debes adjuntar una imagen", flags: MessageFlags.Ephemeral });
      }

      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.some(t => attachment.contentType?.startsWith(t))) {
        return reply({ content: "El archivo debe ser una imagen (jpg, png, gif, webp)", flags: MessageFlags.Ephemeral });
      }

      if (attachment.size > 8 * 1024 * 1024) {
        return reply({ content: "La imagen no puede superar los 8MB", flags: MessageFlags.Ephemeral });
      }

      try {
        const prompt = "Describe detalladamente qué hay en esta imagen. Sé específico: colores, objetos, personas, texto visible, ambiente, estilo. Responde en español. Máximo 3 párrafos.";
        const texto = await generateVision(prompt, attachment.url);

        const describeContainer = buildSimpleContainer({
          title: "Descripción de imagen",
          subtitle: attachment.name ?? "Imagen",
          body: texto ?? "No pude generar una descripción",
          thumbnailUrl: attachment.url,
          color: RED,
        });

        await reply(buildV2Payload(describeContainer));
      } catch (err) {
        log.error("[util describe]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
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
        description: "Audio o video a transcribir (mp3, wav, ogg, webm, mp4, mov — máx 25MB)",
        required: true,
      }),

    async code(ctx) {
      const reply      = await prepareReply(ctx, { thinking: true });
      const attachment = ctx.get("archivo");
      if (!attachment) {
        return reply({ content: "Debes adjuntar un audio o video", flags: MessageFlags.Ephemeral });
      }

      const VALID_EXT = /\.(mp3|mp4|wav|ogg|webm|m4a|flac|mov)$/i;

      if (!VALID_EXT.test(attachment.name ?? "")) {
        return reply({ content: "Formato no soportado. Usa: mp3, wav, ogg, webm, mp4, m4a, flac, mov", flags: MessageFlags.Ephemeral });
      }

      const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
      if (attachment.size > MAX_MEDIA_BYTES) {
        return reply({ content: "El archivo no puede superar los 25MB", flags: MessageFlags.Ephemeral });
      }

      const isMov = /\.mov$/i.test(attachment.name ?? "") || attachment.contentType === "video/quicktime";

      try {
        const fileRes = await fetchPublic(attachment.url, {}, 15_000);
        if (!fileRes.ok) throw new Error(`No se pudo descargar archivo (${fileRes.status})`);
        const body = await readBodyLimited(fileRes, MAX_MEDIA_BYTES);
        if (body.tooLarge) {
          return reply({ content: "El archivo no puede superar los 25MB", flags: MessageFlags.Ephemeral });
        }
        const buffer = body.buffer;

        let texto = null;

        if (isMov) {
          texto = await generateTranscription(buffer, attachment.contentType || "video/quicktime");
        } else {
          try {
            const { default: Groq } = require("groq-sdk");
            const groq = new Groq({ apiKey: process.env.GROQ });
            const blob = new Blob([buffer], { type: attachment.contentType || "audio/mpeg" });
            const file = new File([blob], attachment.name ?? "audio.mp3", { type: blob.type });

            const result = await groq.audio.transcriptions.create({
              file,
              model: "whisper-large-v3",
              response_format: "text",
            });
            texto = result?.trim() || null;
          } catch (groqErr) {
            log.warn("[util transcribe] Falló Groq Whisper; usando Gemini como fallback", {
              err: groqErr?.message ?? String(groqErr),
            });
            texto = await generateTranscription(buffer, attachment.contentType || "audio/mpeg");
          }
        }

        if (!texto) return reply({ content: "No se detectó voz inteligible en el archivo", flags: MessageFlags.Ephemeral });

        if (texto.length > 3850) {
          const fileContainer = createContainer(RED);
          addTextBlock(fileContainer, "## Transcripción\nLa transcripción es muy larga, se adjunta como archivo:");
          const fileAtt = addAttachmentFile(fileContainer, Buffer.from(texto, "utf-8"), "transcripcion.txt");
          return reply(buildV2Payload(fileContainer, { files: [fileAtt] }));
        }

        const transcribeContainer = buildSimpleContainer({
          title: "Transcripción",
          subtitle: attachment.name ?? "Audio",
          body: texto,
          color: RED,
        });

        await reply(buildV2Payload(transcribeContainer));
      } catch (err) {
        log.error("[util transcribe]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
      }
    },
  })


  // ── DMALL ─────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "dm",
      description: "Envía un DM con embed a todos los miembros del servidor",
    }),
    params: new ParamsBuilder()
      .addString({
        name: "titulo",
        description: "Título del embed",
        required: true,
      })
      .addString({
        name: "texto",
        description: "Mensaje que recibirán los usuarios",
        required: true,
      })
      .addRole({
        name: "solo_rol",
        description: "Enviar solo a miembros con este rol",
        required: false,
      })
      .addRole({
        name: "excluir_rol",
        description: "Excluir todos los miembros con este rol",
        required: false,
      })
      .addMember({
        name: "excluir_usuario",
        description: "Excluir un usuario específico",
        required: false,
      })
      .addAttachment({
        name: "imagen",
        description: "Imagen opcional para adjuntar al embed",
        required: false,
      }),
 
    plugins: [Plugins.hasPerms("Administrator")],
 
    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);
 
      const titulo          = ctx.get("titulo");
      const texto           = ctx.get("texto");
      const soloRol         = ctx.get("solo_rol");
      const rolExcluido     = ctx.get("excluir_rol");
      const usuarioExcluido = ctx.get("excluir_usuario");
      const imagen          = ctx.get("imagen");
 
      const isSlash = Boolean(ctx.interaction);
      if (isSlash) await ctx.interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const sendStatus = isSlash ? (p) => ctx.interaction.editReply(p) : (p) => ctx.send(p);

      const author = ctx.user ?? ctx.author;
      const embed  = buildDmAllEmbed({ titulo, texto, author, guild: ctx.guild, imagenUrl: imagen?.url });

      const result = await broadcastDm({
        guild: ctx.guild,
        embed,
        soloRolId: soloRol?.id,
        excluirRolId: rolExcluido?.id,
        excluirUserId: usuarioExcluido?.id,
        onProgress: (done, total) => sendStatus({ content: `enviando... ${done}/${total}` }).catch(() => null),
      });

      if (!result) return sendStatus({ content: "Ya hay un DM masivo en curso en este servidor, espera a que termine" });

      const { enviados, fallidos } = result;
      const filtros = [
        soloRol         ? `Solo rol: ${soloRol} (\`${soloRol.id}\`)`                              : null,
        rolExcluido     ? `Rol excluido: ${rolExcluido} (\`${rolExcluido.id}\`)`                  : null,
        usuarioExcluido ? `Usuario excluido: ${usuarioExcluido.user.tag} (\`${usuarioExcluido.id}\`)` : null,
      ].filter(Boolean);

      await sendLog(ctx.guild, buildDmAllLogEmbed({ author, enviados, fallidos, titulo, texto, filtros })).catch(() => null);

      await sendStatus({
        content: `hecho\nEnviados: **${enviados}**\nFallidos: **${fallidos}**`,
      }).catch(() => null);
    },
  })


  // ── RESUME ────────────────────────────────────
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
      const reply = await prepareReply(ctx, { thinking: true });
      const texto = ctx.get("texto");

      if (texto.length < 100) {
        return reply({ content: "El texto es demasiado corto para resumir", flags: MessageFlags.Ephemeral });
      }

      try {
        const resumen = await generateText(
          `Resume el siguiente texto. Solo el resumen, sin frases previas ni comentarios adicionales. Objetivo, fiel al contenido original, sin opiniones ni interpretaciones. Responde en español.\n\n${texto.slice(0, 8000)}`
        );

        const resumenContainer = buildSimpleContainer({
          title: "Resumen",
          body: resumen ?? "No pude generar un resumen",
          color: RED,
        });

        await reply(buildV2Payload(resumenContainer));
      } catch (err) {
        log.error("[util resume]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
      }
    },
  }),
};

const pollCommand = {
  data: new CommandBuilder({
    name: "poll",
    description: "Crea una encuesta nativa",
  }),
  params: new ParamsBuilder()
    .addString({
      name: "pregunta",
      description: "Pregunta de la encuesta",
      required: true,
      max_length: 300,
    })
    .addString({
      name: "opciones",
      description: "Opciones separadas por / (de 2 a 10)",
      required: true,
    })
    .addString({
      name: "duracion",
      description: "Horas de duración (1-768, por defecto 24)",
      required: false,
    })
    .addString({
      name: "multiple",
      description: "¿Permitir varias respuestas?",
      required: false,
      choices: [{ name: "Sí", value: "true" }],
    }),

  async code(ctx) {
    try {
      const pregunta = String(ctx.get("pregunta") ?? "").trim();
      const opciones = String(ctx.get("opciones") ?? "")
        .split("/")
        .map((o) => o.trim())
        .filter(Boolean);

      if (!pregunta || pregunta.length > 300) {
        return ctx.send({ content: "La pregunta debe tener entre 1 y 300 caracteres", flags: MessageFlags.Ephemeral });
      }
      if (opciones.length < 2 || opciones.length > 10) {
        return ctx.send({ content: "Debes dar entre 2 y 10 opciones separadas por `/`", flags: MessageFlags.Ephemeral });
      }
      if (opciones.some((o) => o.length > 55)) {
        return ctx.send({ content: "Cada opción puede tener como máximo 55 caracteres", flags: MessageFlags.Ephemeral });
      }

      const horas = Math.min(768, Math.max(1, Number.parseInt(ctx.get("duracion"), 10) || 24));

      await ctx.send({
        poll: {
          question: { text: pregunta },
          answers: opciones.map((text) => ({ text })),
          duration: horas,
          allowMultiselect: ctx.get("multiple") === "true",
        },
        allowedMentions: { parse: [], repliedUser: false },
      });
    } catch (err) {
      log.error("[util poll]", { err: err?.message ?? String(err) });
      handleCommandError(ctx, err);
    }
  },
};

const remindCommand = {
  data: new CommandBuilder({
    name: "remind",
    description: "Crea un recordatorio personal",
    aliases: ["recordar"],
  }),
  params: new ParamsBuilder()
    .addString({
      name: "tiempo",
      description: "Tiempo de espera (ej: 30m, 2h, 1d)",
      required: true,
    })
    .addString({
      name: "texto",
      description: "Qué quieres que te recuerde",
      required: true,
      max_length: 500,
    }),

  async code(ctx) {
    try {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();

      const duration = parseDuration(String(ctx.get("tiempo") ?? ""));
      const texto = String(ctx.get("texto") ?? "").trim().slice(0, 500);

      if (!duration || duration < 10_000 || duration > 365 * 86_400_000) {
        return ctx.send({
          content: "Tiempo inválido. Usa `30s`, `10m`, `2h`, `1d` o `1w` (entre 10s y 365d)",
          flags: MessageFlags.Ephemeral,
        });
      }
      if (!texto) {
        return ctx.send({ content: "Debes indicar qué quieres que te recuerde", flags: MessageFlags.Ephemeral });
      }

      const invoker = ctx.user ?? ctx.author;
      const remindAt = new Date(Date.now() + duration);

      const result = await createReminder(ctx.bot, {
        userId: invoker.id,
        guildId: ctx.guild?.id ?? null,
        channelId: ctx.channel?.id ?? null,
        text: texto,
        remindAt,
      });

      if (result.error === "limit") {
        return ctx.send({
          content: `Ya tienes ${result.max} recordatorios pendientes, espera a que alguno se cumpla`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(`Te lo recordaré <t:${Math.floor(remindAt.getTime() / 1000)}:R>`)
            .setColor(GREEN)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      log.error("[util remind]", { err: err?.message ?? String(err) });
      handleCommandError(ctx, err);
    }
  },
};

const ocrCommand = {
  data: new CommandBuilder({
    name: "ocr",
    description: "Extrae el texto de una imagen",
  }),
  params: new ParamsBuilder().addAttachment({
    name: "imagen",
    description: "Imagen con texto (jpg, png, gif, webp)",
    required: true,
  }),

  async code(ctx) {
    const reply = await prepareReply(ctx, { thinking: true });
    const attachment = ctx.get("imagen");
    if (!attachment) {
      return reply({ content: "Debes adjuntar una imagen", flags: MessageFlags.Ephemeral });
    }

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.some((t) => attachment.contentType?.startsWith(t))) {
      return reply({ content: "El archivo debe ser una imagen (jpg, png, gif, webp)", flags: MessageFlags.Ephemeral });
    }

    if (attachment.size > 8 * 1024 * 1024) {
      return reply({ content: "La imagen no puede superar los 8MB", flags: MessageFlags.Ephemeral });
    }

    try {
      const prompt =
        "Extrae todo el texto visible en esta imagen tal como aparece, respetando los saltos de línea. " +
        "No traduzcas, no describas la imagen y no agregues comentarios. Si no hay texto legible responde únicamente: SIN_TEXTO";
      const texto = await generateVision(prompt, attachment.url);

      if (!texto || texto.includes("SIN_TEXTO")) {
        return reply({ content: "No se detectó texto legible en la imagen", flags: MessageFlags.Ephemeral });
      }

      if (texto.length > 3850) {
        const fileContainer = createContainer(RED);
        addHeaderSection(
          fileContainer,
          ["## Texto extraído", "El texto es muy largo, se adjunta como archivo:"],
          attachment.url
        );
        const fileAtt = addAttachmentFile(fileContainer, Buffer.from(texto, "utf-8"), "texto.txt");
        return reply(buildV2Payload(fileContainer, { files: [fileAtt] }));
      }

      const ocrContainer = buildSimpleContainer({
        title: "Texto extraído",
        subtitle: attachment.name ?? "Imagen",
        body: texto,
        thumbnailUrl: attachment.url,
        color: RED,
      });

      await reply(buildV2Payload(ocrContainer));
    } catch (err) {
      log.error("[util ocr]", { err: err?.message ?? String(err) });
      handleCommandError(ctx, err);
    }
  },
};

data.data.addCommand(pollCommand).addCommand(remindCommand).addCommand(ocrCommand);

module.exports = { data };
