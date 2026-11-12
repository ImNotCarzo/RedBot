const path = require("path");
const {
  version: djsVersion,
  GroupBuilder,
  CommandBuilder,
  ParamsBuilder,
  Plugins,
  ComponentsV2Builder,
  V2Text,
} = require("gralonium");
const { deleteConversacion, generateText, generateVision, generateTranscription } = require("../../src/ai");
const { extractFirstUrl, getGuildUploadLimitBytes, resolveVideoMetadata, downloadMeta, buildDownloadV2Payload } = require("../../src/downloader");
const { RED, GREEN, YELLOW } = require("../../src/config");
const { getPrefix, setPrefix, setAfk, sendLog } = require("../../src/guild");
const {
  Logger,
  THINKING_TEXT,
  fetchWithTimeout,
  noGuildReply,
  handleCommandError,
  INVITE_URL,
  SUPPORT_URL,
  broadcastDm,
  buildDmAllEmbed,
  buildDmAllLogEmbed,
} = require("../../src/runtime");
const { version: botVersion } = require("../../package.json");
const { fetchPublic, readBodyLimited } = require("../../src/security");
const { createReminder } = require("../../src/reminders");
const { parseDuration } = require("../../src/moderation");

let graloniumVersion = "0.4.0";
try {
  graloniumVersion = require(path.resolve(path.dirname(require.resolve("gralonium")), "..", "package.json")).version;
} catch {}

const log = new Logger("CMD_UTIL", process.env.LOG_LEVEL);

const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

function validateImageAttachment(ctx, attachment) {
  if (!attachment) return ctx.ephemeral("Debes adjuntar una imagen");
  if (!VALID_IMAGE_TYPES.some((t) => attachment.contentType?.startsWith(t))) {
    return ctx.ephemeral("El archivo debe ser una imagen (jpg, png, gif, webp)");
  }
  if (attachment.size > MAX_IMAGE_SIZE_BYTES) {
    return ctx.ephemeral("La imagen no puede superar los 8MB");
  }
  return null;
}

const TRANSLATE_LANG_NAMES = {
  auto: "Automático",
  es: "Español",
  en: "Inglés",
  pt: "Portugués",
  fr: "Francés",
  de: "Alemán",
  it: "Italiano",
  ja: "Japonés",
  ko: "Coreano",
  "zh-cn": "Chino",
  "zh-tw": "Chino tradicional",
  ru: "Ruso",
  ar: "Árabe",
  nl: "Neerlandés",
};

// ─────────────────────────────────────────────
//  HELPERS DE FORMATO Y COMPONENTES V2
// ─────────────────────────────────────────────

const num = (n) => Number(n).toLocaleString("es-ES");
const cleanVersion = (v) => `v${String(v ?? "").replace(/^v/i, "")}`;

/** "2d 4h 3m", omitiendo unidades vacías */
const formatUptime = (ms) => {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length || s) parts.push(`${s}s`);
  return parts.join(" ");
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatAttachmentMeta = (attachment, fallbackName) => {
  const parts = [V2Text.clip(attachment?.name ?? fallbackName, 80)];
  if (attachment?.width && attachment?.height) parts.push(`${attachment.width}×${attachment.height}`);
  const size = formatBytes(attachment?.size);
  if (size) parts.push(size);
  return parts.join(" · ");
};

const formatLanguage = (langCode) => {
  const key = V2Text.clip(langCode, 40, "");
  const label = TRANSLATE_LANG_NAMES[key.toLowerCase()];
  if (!label) return key || "desconocido";
  return key.toLowerCase() === "auto" ? label : `${label} (${key})`;
};

function buildCompactCard({ title, subtitle = null, body = null, footer = null, color = RED, thumbnailUrl = null, divider = false, links = [] }) {
  const builder = new ComponentsV2Builder({ color });
  const header = subtitle
    ? `${V2Text.heading(title, 3, 180)}\n${V2Text.subtext(subtitle, 180)}`
    : V2Text.heading(title, 3, 200);
  const footerLine = footer ? V2Text.subtext(footer, 180) : null;

  if (thumbnailUrl && body) {
    builder.addSection([header, body, footerLine].filter(Boolean), {
      thumbnail: thumbnailUrl,
      fallbackToText: true,
    });
  } else {
    builder.addSection([header], { thumbnail: thumbnailUrl, fallbackToText: true });
    if (body) {
      builder[divider ? "addSeparator" : "addSpacer"]("small");
      builder.addText(body);
    }
    if (footerLine) {
      builder.addSpacer("small").addText(footerLine);
    }
  }

  if (links.length) {
    builder.addSpacer("small").addButtonsRow(
      links.map((l) => ({ label: l.label, style: "link", url: l.url })),
      { autoWrap: true }
    );
  }

  return builder;
}

function buildDmStatusCard({ title, guildName, iconUrl = null, rows = [], filters = [], color = RED }) {
  const builder = new ComponentsV2Builder({ color })
    .addSection(
      [`${V2Text.heading(title, 3, 120)}\n${V2Text.subtext(guildName, 80)}`],
      { thumbnail: iconUrl, fallbackToText: true }
    )
    .addSeparator("small")
    .addFields(rows);

  if (filters.length) {
    builder.addSectionBlock("Filtros", filters, { separator: true });
  }
  return builder;
}

function buildJumboCard({ title, subtitle, imageUrl }) {
  return ComponentsV2Builder.imageView({
    title,
    subtitle: V2Text.subtext(subtitle),
    image: imageUrl,
    links: [{ label: "Abrir imagen", url: imageUrl }],
    color: RED,
  });
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
        const before = Date.now();
        const sent = await ctx.send(new ComponentsV2Builder({ color: RED }).addText(THINKING_TEXT));
        const msgPing = Date.now() - before;
        const apiPing = Math.max(0, ctx.bot?.ws?.ping ?? 0);

        const result = buildCompactCard({
          title: "Pong!",
          body: V2Text.fields([
            ["Mensaje", V2Text.code(`${msgPing}ms`)],
            ["API", V2Text.code(`${apiPing}ms`)],
          ]),
          color: RED,
        });

        await sent.edit(result.toPayload());
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
        if (!bot?.user) return ctx.ephemeral("Error al obtener la información");

        const servers = bot.guilds.cache.size;
        const users = bot.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const createdAt = Math.floor(bot.user.createdTimestamp / 1000);

        const generalRows = [
          ["ID", V2Text.code(bot.user.id)],
          ["Versión", V2Text.code(cleanVersion(botVersion))],
          ["Creación", `<t:${createdAt}:D> (<t:${createdAt}:R>)`],
        ];
        const statsRows = [
          ["Servidores", V2Text.code(num(servers))],
          ["Usuarios", V2Text.code(num(users))],
          ["Tiempo activo", V2Text.code(formatUptime(bot.uptime ?? 0))],
        ];
        const extraRows = [
          ["Creador", V2Text.code("carzo.")],
          ["Node.js", V2Text.code(process.version)],
          ["discord.js", V2Text.code(cleanVersion(djsVersion))],
          ["Gralonium", V2Text.code(cleanVersion(graloniumVersion))],
        ];

        const builder = new ComponentsV2Builder({ color: RED })
          .addSection(
            [V2Text.heading(bot.user.username, 3, 100), V2Text.sectionBlock("General", generalRows)],
            { thumbnail: bot.user.displayAvatarURL({ size: 1024 }) }
          )
          .addSectionBlock("Estadísticas", statsRows, { separator: true })
          .addSectionBlock("Extra", extraRows, { separator: true })
          .addSpacer("small")
          .addButtonsRow([
            { label: "Invitar", style: "link", url: INVITE_URL },
            { label: "Soporte", style: "link", url: SUPPORT_URL },
          ]);

        await ctx.send(builder);
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
        const card = buildCompactCard({
          title: ctx.bot?.user?.username ?? "RedBot",
          subtitle: cleanVersion(botVersion),
          body: "Invítame a tu servidor o únete al servidor de soporte.",
          thumbnailUrl: ctx.bot?.user?.displayAvatarURL?.({ size: 256 }) ?? null,
          color: RED,
          links: [
            { label: "Invitar", url: INVITE_URL },
            { label: "Soporte", url: SUPPORT_URL },
          ],
        });
        await ctx.send(card);
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
        if (!ctx.guild) return noGuildReply(ctx);

        const nuevo = ctx.get("nuevo")?.trim();
        const guildIcon = ctx.guild.iconURL({ size: 256 });

        if (!nuevo) {
          const prefix = await getPrefix(ctx.guild.id);
          return ctx.send(
            buildCompactCard({
              title: "Prefix actual",
              subtitle: ctx.guild.name,
              body: V2Text.fields([["Prefix", V2Text.code(prefix)]]),
              thumbnailUrl: guildIcon,
              color: RED,
            })
          );
        }

        if (nuevo.length > 3) {
          return ctx.ephemeral("El prefix no puede tener más de 3 caracteres");
        }

        const anterior = await getPrefix(ctx.guild.id);
        await setPrefix(ctx.guild.id, nuevo);

        await ctx.send(
          buildCompactCard({
            title: "Prefix actualizado",
            subtitle: ctx.guild.name,
            body: V2Text.fields([
              ["Anterior", V2Text.code(anterior)],
              ["Nuevo", V2Text.code(nuevo)],
            ]),
            thumbnailUrl: guildIcon,
            color: GREEN,
          })
        );
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
      try {
        const userId = ctx.user?.id;
        deleteConversacion(userId);
        await ctx.send(
          buildCompactCard({
            title: "Historial reiniciado",
            body: "Se limpió tu conversación con la IA.",
            color: GREEN,
          })
        );
      } catch (err) {
        log.error("[util askreset]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
      }
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
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        const invoker = ctx.user;
        const customReason = ctx.get("razon")?.trim();
        const reason = customReason ? V2Text.clip(customReason, 256) : "Sin motivo";

        const saved = await setAfk(ctx.guild.id, invoker.id, reason);
        const sinceTs = Math.floor(new Date(saved?.createdAt ?? Date.now()).getTime() / 1000);

        await ctx.send(
          buildCompactCard({
            title: invoker.username,
            body: V2Text.fields([
              ["Motivo", V2Text.clip(reason, 256)],
              ["Desde", `<t:${sinceTs}:R>`],
            ]),
            footer: "Ahora estás AFK",
            thumbnailUrl: invoker.displayAvatarURL({ size: 256 }),
            color: RED,
          })
        );
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
      await ctx.defer();
      try {
        const raw = (ctx.get("emoji") ?? "").trim();
        if (!raw) {
          return ctx.ephemeral("Debes ingresar un emoji válido");
        }

        const customMatch = raw.match(/<(a)?:([a-zA-Z0-9_]+):(\d{17,20})>/);
        if (customMatch) {
          const animated = Boolean(customMatch[1]);
          const name = customMatch[2];
          const id = customMatch[3];
          const ext = animated ? "gif" : "png";
          const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=4096&quality=lossless`;

          return ctx.send(
            buildJumboCard({
              title: `:${V2Text.clip(name, 80)}:`,
              subtitle: `ID ${id} · ${ext.toUpperCase()}`,
              imageUrl: url,
            })
          );
        }

        const chars = [...raw];
        if (!chars.length || chars.length > 10 || /^[a-zA-Z0-9\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]+$/.test(raw)) {
          return ctx.ephemeral("Debes ingresar un emoji válido");
        }

        const rawCps = chars.map((c) => c.codePointAt(0).toString(16));
        const filteredCps = rawCps.includes("200d") ? rawCps : rawCps.filter((cp) => cp !== "fe0f");
        if (!filteredCps.length) {
          return ctx.ephemeral("Debes ingresar un emoji válido");
        }

        const twemojiUrl = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${filteredCps.join("-")}.png`;
        const checkRes = await fetchWithTimeout(twemojiUrl, { method: "HEAD" }, 5000).catch(() => null);
        if (!checkRes?.ok) {
          return ctx.ephemeral("No pude encontrar ese emoji");
        }

        const highResUrl = `https://emojicdn.elk.sh/${encodeURIComponent(raw)}?style=twitter`;
        const codepoints = filteredCps.map((cp) => `U+${cp.toUpperCase()}`).join(" ");

        return ctx.send(
          buildJumboCard({
            title: raw,
            subtitle: `Código ${codepoints} · PNG`,
            imageUrl: highResUrl,
          })
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
      await ctx.defer();
      const texto = ctx.get("texto");
      const idioma = ctx.get("idioma") ?? "es";

      try {
        const { translate } = require("@vitalets/google-translate-api");
        const result = await translate(texto, { to: idioma });

        const origen = result.raw?.src ?? "auto";
        const traduccion = result.text;

        if (!traduccion) {
          return ctx.ephemeral("No se pudo generar la traducción");
        }

        const builder = new ComponentsV2Builder({ color: RED })
          .addText(`${V2Text.heading("Traducción", 3)}\n${V2Text.subtext(`${formatLanguage(origen)} → ${formatLanguage(idioma)}`)}`)
          .addSeparator("small")
          .addText(`**Original**\n${V2Text.quote(texto, 1300)}`)
          .addSpacer("small")
          .addText(`**Resultado**\n${V2Text.quote(traduccion, 2100)}`);

        await ctx.send(builder);
      } catch (err) {
        log.error("[util translate]", { err: err?.message ?? String(err) });
        if (err.name === "TooManyRequestsError") {
          return ctx.ephemeral("Google Translate está saturado, intenta en unos segundos");
        }
        await ctx.ephemeral("No se pudo conectar con el servicio de traducción");
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
      await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
      const rawInput = ctx.get("url");
      const url = extractFirstUrl(rawInput);

      if (!url) {
        return ctx.ephemeral("Debes proporcionar un enlace válido (`https://...`)");
      }

      try {
        const meta = await resolveVideoMetadata(url);
        if (!meta?.videoUrl) {
          log.warn("[util download] sin video extraíble", { url });
          return ctx.ephemeral("No pude extraer ningún video de ese enlace. Verifica que sea público y contenga un video.");
        }

        const maxBytes = getGuildUploadLimitBytes(ctx.guild);
        const downloadResult = await downloadMeta(meta, maxBytes);
        const payload = buildDownloadV2Payload(meta, downloadResult);

        try {
          await ctx.send(payload);
        } catch (sendErr) {
          if (sendErr?.code === 40005 || sendErr?.status === 413) {
            const fallbackPayload = buildDownloadV2Payload(meta, {
              tooLarge: true,
              size: downloadResult.size,
            });
            return await ctx.send(fallbackPayload);
          }
          throw sendErr;
        }
      } catch (err) {
        log.error("[util download]", { err: err?.message ?? String(err) });
        return ctx.ephemeral("No se pudo descargar el video en este momento. Intenta con otro enlace.");
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
      await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
      const attachment = ctx.get("imagen");
      const invalid = validateImageAttachment(ctx, attachment);
      if (invalid) return invalid;

      try {
        const prompt = "Describe detalladamente qué hay en esta imagen. Sé específico: colores, objetos, personas, texto visible, ambiente, estilo. Responde en español. Máximo 3 párrafos.";
        const texto = await generateVision(prompt, attachment.url);

        const meta = formatAttachmentMeta(attachment, "imagen");
        const builder = new ComponentsV2Builder({ color: RED })
          .addSection(
            [`${V2Text.heading("Descripción de imagen", 3)}\n${V2Text.subtext(meta)}`],
            { thumbnail: attachment.url, fallbackToText: true }
          )
          .addSeparator("small")
          .addSmartText(texto ?? "No pude generar una descripción", { overflow: "clip" });

        await ctx.send(builder);
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
      await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
      const attachment = ctx.get("archivo");
      if (!attachment) {
        return ctx.ephemeral("Debes adjuntar un audio o video");
      }

      const VALID_EXT = /\.(mp3|mp4|wav|ogg|webm|m4a|flac|mov)$/i;

      if (!VALID_EXT.test(attachment.name ?? "")) {
        return ctx.ephemeral("Formato no soportado. Usa: mp3, wav, ogg, webm, mp4, m4a, flac, mov");
      }

      const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
      if (attachment.size > MAX_MEDIA_BYTES) {
        return ctx.ephemeral("El archivo no puede superar los 25MB");
      }

      const isMov = /\.mov$/i.test(attachment.name ?? "") || attachment.contentType === "video/quicktime";

      try {
        const fileRes = await fetchPublic(attachment.url, {}, 15_000);
        if (!fileRes.ok) throw new Error(`No se pudo descargar archivo (${fileRes.status})`);
        const body = await readBodyLimited(fileRes, MAX_MEDIA_BYTES);
        if (body.tooLarge) {
          return ctx.ephemeral("El archivo no puede superar los 25MB");
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

        if (!texto) return ctx.ephemeral("No se detectó voz inteligible en el archivo");

        const meta = formatAttachmentMeta(attachment, "audio");
        const subtitle = texto.length > 3600 ? `${meta} · ${num(texto.length)} caracteres` : meta;
        const builder = new ComponentsV2Builder({ color: RED })
          .addText(`${V2Text.heading("Transcripción", 3)}\n${V2Text.subtext(subtitle)}`)
          .addSeparator("small")
          .addSmartText(texto, {
            maxLength: 3600,
            overflow: "file",
            filename: "transcripcion.txt",
            preview: false,
            overflowNotice: "El texto supera el límite del mensaje, se adjunta como archivo.",
          });

        await ctx.send(builder);
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

      const titulo = ctx.get("titulo");
      const texto = ctx.get("texto");
      const soloRol = ctx.get("solo_rol");
      const rolExcluido = ctx.get("excluir_rol");
      const usuarioExcluido = ctx.get("excluir_usuario");
      const imagen = ctx.get("imagen");

      await ctx.defer({ ephemeral: true });

      let statusMsg = null;
      const sendStatus = async (builder) => {
        if (!ctx.interaction && statusMsg && typeof statusMsg.edit === "function") {
          return statusMsg.edit(builder.toPayload());
        }
        const sent = await ctx.send(builder);
        if (!statusMsg) statusMsg = sent;
        return sent;
      };

      const author = ctx.user;
      const embed = buildDmAllEmbed({ titulo, texto, author, guild: ctx.guild, imagenUrl: imagen?.url });
      const guildIcon = ctx.guild.iconURL({ size: 256 });
      const displayFilters = [
        soloRol ? ["Solo rol", `${soloRol}`] : null,
        rolExcluido ? ["Rol excluido", `${rolExcluido}`] : null,
        usuarioExcluido ? ["Usuario excluido", `${usuarioExcluido.user.tag}`] : null,
      ].filter(Boolean);

      const result = await broadcastDm({
        guild: ctx.guild,
        embed,
        soloRolId: soloRol?.id,
        excluirRolId: rolExcluido?.id,
        excluirUserId: usuarioExcluido?.id,
        onProgress: (done, total) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return sendStatus(
            buildDmStatusCard({
              title: "Enviando DM masivo",
              guildName: ctx.guild.name,
              iconUrl: guildIcon,
              rows: [["Progreso", `${V2Text.code(`${num(done)} / ${num(total)}`)} (${pct}%)`]],
              filters: displayFilters,
              color: RED,
            })
          ).catch(() => null);
        },
      });

      if (!result) {
        return sendStatus(
          buildCompactCard({
            title: "DM masivo en curso",
            subtitle: ctx.guild.name,
            body: "Ya hay un envío activo en este servidor, espera a que termine.",
            thumbnailUrl: guildIcon,
            color: YELLOW,
          })
        ).catch(() => null);
      }

      const { enviados, fallidos, total } = result;
      const filtrosLog = [
        soloRol ? `Solo rol: ${soloRol} (\`${soloRol.id}\`)` : null,
        rolExcluido ? `Rol excluido: ${rolExcluido} (\`${rolExcluido.id}\`)` : null,
        usuarioExcluido ? `Usuario excluido: ${usuarioExcluido.user.tag} (\`${usuarioExcluido.id}\`)` : null,
      ].filter(Boolean);

      await sendLog(ctx.guild, buildDmAllLogEmbed({ author, enviados, fallidos, titulo, texto, filtros: filtrosLog })).catch(() => null);

      await sendStatus(
        buildDmStatusCard({
          title: "DM masivo completado",
          guildName: ctx.guild.name,
          iconUrl: guildIcon,
          rows: [
            ["Enviados", V2Text.code(num(enviados))],
            ["Fallidos", V2Text.code(num(fallidos))],
            ["Total", V2Text.code(num(total))],
          ],
          filters: displayFilters,
          color: enviados === 0 && fallidos > 0 ? YELLOW : GREEN,
        })
      ).catch(() => null);
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
      await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
      const texto = ctx.get("texto");

      if (texto.length < 100) {
        return ctx.ephemeral("El texto es demasiado corto para resumir");
      }

      try {
        const resumen = await generateText(
          `Resume el siguiente texto. Solo el resumen, sin frases previas ni comentarios adicionales. Objetivo, fiel al contenido original, sin opiniones ni interpretaciones. Responde en español.\n\n${texto.slice(0, 8000)}`
        );

        const header = resumen
          ? `${V2Text.heading("Resumen", 3)}\n${V2Text.subtext(`${num(texto.length)} → ${num(resumen.length)} caracteres`)}`
          : V2Text.heading("Resumen", 3);
        const builder = new ComponentsV2Builder({ color: RED })
          .addText(header)
          .addSeparator("small")
          .addSmartText(resumen || "No pude generar un resumen", { overflow: "clip" });

        await ctx.send(builder);
      } catch (err) {
        log.error("[util resume]", { err: err?.message ?? String(err) });
        handleCommandError(ctx, err);
      }
    },
  }),
};

// ─────────────────────────────────────────────
//  COMANDOS EXTRA
// ─────────────────────────────────────────────

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
        return ctx.ephemeral("La pregunta debe tener entre 1 y 300 caracteres");
      }
      if (opciones.length < 2 || opciones.length > 10) {
        return ctx.ephemeral("Debes dar entre 2 y 10 opciones separadas por `/`");
      }
      if (opciones.some((o) => o.length > 55)) {
        return ctx.ephemeral("Cada opción puede tener como máximo 55 caracteres");
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
      const duration = parseDuration(String(ctx.get("tiempo") ?? ""));
      const texto = String(ctx.get("texto") ?? "").trim().slice(0, 500);

      if (!duration || duration < 10_000 || duration > 365 * 86_400_000) {
        return ctx.ephemeral("Tiempo inválido. Usa `30s`, `10m`, `2h`, `1d` o `1w` (entre 10s y 365d)");
      }
      if (!texto) {
        return ctx.ephemeral("Debes indicar qué quieres que te recuerde");
      }

      await ctx.defer();

      const invoker = ctx.user;
      const remindAt = new Date(Date.now() + duration);

      const result = await createReminder(ctx.bot, {
        userId: invoker.id,
        guildId: ctx.guild?.id ?? null,
        channelId: ctx.channel?.id ?? null,
        text: texto,
        remindAt,
      });

      if (result.error === "limit") {
        return ctx.ephemeral(`Ya tienes ${result.max} recordatorios pendientes, espera a que alguno se cumpla`);
      }

      const ts = Math.floor(remindAt.getTime() / 1000);
      const builder = new ComponentsV2Builder({ color: GREEN })
        .addText(`${V2Text.heading("Recordatorio creado", 3)}\n${V2Text.subtext(`<t:${ts}:f> · <t:${ts}:R>`)}`)
        .addSeparator("small")
        .addQuote(texto, { maxLength: 1200 });

      await ctx.send(builder);
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
    await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
    const attachment = ctx.get("imagen");
    const invalid = validateImageAttachment(ctx, attachment);
    if (invalid) return invalid;

    try {
      const prompt =
        "Extrae todo el texto visible en esta imagen tal como aparece, respetando los saltos de línea. " +
        "No traduzcas, no describas la imagen y no agregues comentarios. Si no hay texto legible responde únicamente: SIN_TEXTO";
      const texto = await generateVision(prompt, attachment.url);

      if (!texto || texto.includes("SIN_TEXTO")) {
        return ctx.ephemeral("No se detectó texto legible en la imagen");
      }

      const meta = formatAttachmentMeta(attachment, "imagen");
      const subtitle = texto.length > 3600 ? `${meta} · ${num(texto.length)} caracteres` : meta;
      const builder = new ComponentsV2Builder({ color: RED })
        .addSection(
          [`${V2Text.heading("Texto extraído", 3)}\n${V2Text.subtext(subtitle)}`],
          { thumbnail: attachment.url, fallbackToText: true }
        )
        .addSeparator("small")
        .addSmartText(texto, {
          maxLength: 3600,
          overflow: "file",
          filename: "texto.txt",
          preview: false,
          overflowNotice: "El texto supera el límite del mensaje, se adjunta como archivo.",
        });

      await ctx.send(builder);
    } catch (err) {
      log.error("[util ocr]", { err: err?.message ?? String(err) });
      handleCommandError(ctx, err);
    }
  },
};

data.data.addCommand(pollCommand).addCommand(remindCommand).addCommand(ocrCommand);

module.exports = { data };
