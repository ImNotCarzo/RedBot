const {
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  version: djsVersion,
} = require("discord.js");
const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { deleteConversacion, generateText, generateVision, generateTranscription } = require("../../src/ai");
const { extractFirstUrl, getGuildUploadLimitBytes, resolveVideoMetadata, downloadMeta, buildDownloadV2Payload } = require("../../src/downloader");
const { RED, GREEN, YELLOW } = require("../../src/config");
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
  V2_MAX_MESSAGE_TEXT,
  createContainer,
  addHeaderSection,
  addSeparator,
  addTextBlock,
  addLinkButtons,
  addAttachmentFile,
  clipV2Text,
  budgetBodyText,
  buildV2Payload,
} = require("../../src/v2");
const { version: botVersion } = require("../../package.json");
const { fetchPublic, readBodyLimited } = require("../../src/security");
const { createReminder } = require("../../src/reminders");
const { parseDuration } = require("../../src/moderation");

let graloniumVersion = "0.3.0";
try { graloniumVersion = require("gralonium/package.json").version; } catch {}

const log = new Logger("CMD_UTIL", process.env.LOG_LEVEL);

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

const code = (v) => `\`${v}\``;
const num = (n) => Number(n).toLocaleString("es-ES");
const cleanVersion = (v) => `v${String(v ?? "").replace(/^v/i, "")}`;

/** Lista de campos en cita: > **Etiqueta:** valor */
const fields = (rows) =>
  rows
    .filter(Boolean)
    .map(([label, value]) => `> **${label}:** ${value}`)
    .join("\n");

/** Bloque con subtítulo ### y campos alineados al estilo de RedBot */
const sectionBlock = (heading, rows) => `### ${heading}\n${fields(rows)}`;

/** Convierte texto multilínea en cita sin cortar líneas vacías intermedias */
const quote = (text, maxLen = null) => {
  const quoted = String(text ?? "")
    .trimEnd()
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n") || "> -";
  return maxLen ? clipV2Text(quoted, maxLen) : quoted;
};

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
  const parts = [clipV2Text(attachment?.name ?? fallbackName, 80)];
  if (attachment?.width && attachment?.height) parts.push(`${attachment.width}×${attachment.height}`);
  const size = formatBytes(attachment?.size);
  if (size) parts.push(size);
  return parts.join(" · ");
};

const formatLanguage = (langCode) => {
  const key = clipV2Text(langCode, 40, "");
  const label = TRANSLATE_LANG_NAMES[key.toLowerCase()];
  if (!label) return key || "desconocido";
  return key.toLowerCase() === "auto" ? label : `${label} (${key})`;
};

function addButtonSection(container, texts, linkLabel, linkUrl) {
  const list = (Array.isArray(texts) ? texts : [texts])
    .map((t) => String(t ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);

  const section = new SectionBuilder().setButtonAccessory(
    new ButtonBuilder()
      .setLabel(String(linkLabel).slice(0, 80))
      .setStyle(ButtonStyle.Link)
      .setURL(linkUrl.trim())
  );

  for (const entry of list) {
    section.addTextDisplayComponents(new TextDisplayBuilder().setContent(clipV2Text(entry, V2_MAX_MESSAGE_TEXT)));
  }

  container.addSectionComponents(section);
  return container;
}

function buildCompactCard({ title, subtitle = null, body = null, color = RED, thumbnailUrl = null, divider = false, links = [] }) {
  const container = createContainer(color);
  const header = subtitle ? `## ${clipV2Text(title, 180)}\n-# ${clipV2Text(subtitle, 180)}` : `## ${clipV2Text(title, 200)}`;

  if (thumbnailUrl && body) {
    addHeaderSection(container, [header, body], thumbnailUrl);
  } else {
    addHeaderSection(container, [header], thumbnailUrl);
    if (body) {
      addSeparator(container, SeparatorSpacingSize.Small, divider);
      addTextBlock(container, body);
    }
  }

  if (links.length) {
    addSeparator(container, SeparatorSpacingSize.Small, false);
    addLinkButtons(container, links);
  }

  return container;
}

function buildDmStatusContainer({ title, guildName, iconUrl = null, rows = [], filters = [], color = RED }) {
  const container = createContainer(color);
  const header = `## ${clipV2Text(title, 120)}\n-# ${clipV2Text(guildName, 80)}`;
  const bodyParts = [fields(rows)];
  if (filters.length) bodyParts.push(sectionBlock("Filtros", filters));

  addHeaderSection(container, [header], iconUrl);
  addSeparator(container);
  addTextBlock(container, bodyParts.join("\n\n"));
  return container;
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
        const thinking = createContainer(RED);
        addTextBlock(thinking, THINKING_TEXT);

        const before = Date.now();
        const sent = await ctx.send(buildV2Payload(thinking));
        const msgPing = Date.now() - before;
        const apiPing = Math.max(0, ctx.bot?.ws?.ping ?? 0);

        const result = buildCompactCard({
          title: "Pong!",
          body: fields([
            ["Mensaje", code(`${msgPing}ms`)],
            ["API", code(`${apiPing}ms`)],
          ]),
          color: RED,
        });

        await sent.edit(buildV2Payload(result));
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

        const servers = bot.guilds.cache.size;
        const users = bot.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const createdAt = Math.floor(bot.user.createdTimestamp / 1000);

        const container = createContainer(RED);

        addHeaderSection(
          container,
          [
            `## ${clipV2Text(bot.user.username, 100)}`,
            sectionBlock("General", [
              ["ID", code(bot.user.id)],
              ["Versión", code(cleanVersion(botVersion))],
              ["Creación", `<t:${createdAt}:D> (<t:${createdAt}:R>)`],
            ]),
          ],
          bot.user.displayAvatarURL({ size: 1024 })
        );
        addSeparator(container);

        addTextBlock(
          container,
          `${sectionBlock("Estadísticas", [
            ["Servidores", code(num(servers))],
            ["Usuarios", code(num(users))],
            ["Tiempo activo", code(formatUptime(bot.uptime ?? 0))],
          ])}\n\n${sectionBlock("Extra", [
            ["Creador", code("carzo.")],
            ["Node.js", code(process.version)],
            ["discord.js", code(cleanVersion(djsVersion))],
            ["Gralonium", code(cleanVersion(graloniumVersion))],
          ])}`
        );
        addSeparator(container, SeparatorSpacingSize.Small, false);

        addLinkButtons(container, [
          { label: "Invitar", url: INVITE_URL },
          { label: "Soporte", url: SUPPORT_URL },
        ]);

        await ctx.send(buildV2Payload(container));
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
        const container = buildCompactCard({
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
        if (!ctx.guild) return noGuildReply(ctx);

        const nuevo = ctx.get("nuevo")?.trim();
        const guildIcon = ctx.guild.iconURL({ size: 256 });

        if (!nuevo) {
          const prefix = await getPrefix(ctx.guild.id);
          return ctx.send(
            buildV2Payload(
              buildCompactCard({
                title: "Prefix actual",
                subtitle: ctx.guild.name,
                body: fields([["Prefix", code(prefix)]]),
                thumbnailUrl: guildIcon,
                color: RED,
              })
            )
          );
        }

        if (nuevo.length > 3) {
          return ctx.send({ content: "El prefix no puede tener más de 3 caracteres", flags: MessageFlags.Ephemeral });
        }

        const anterior = await getPrefix(ctx.guild.id);
        await setPrefix(ctx.guild.id, nuevo);

        await ctx.send(
          buildV2Payload(
            buildCompactCard({
              title: "Prefix actualizado",
              subtitle: ctx.guild.name,
              body: fields([
                ["Anterior", code(anterior)],
                ["Nuevo", code(nuevo)],
              ]),
              thumbnailUrl: guildIcon,
              color: GREEN,
            })
          )
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
        const userId = ctx.user?.id ?? ctx.author?.id;
        deleteConversacion(userId);
        await ctx.send(
          buildV2Payload(
            buildCompactCard({
              title: "Historial reiniciado",
              body: "Se limpió tu conversación con la IA.",
              color: GREEN,
            })
          )
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
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);

        const invoker = ctx.user ?? ctx.author;
        const customReason = ctx.get("razon")?.trim();
        const reason = customReason ? clipV2Text(customReason, 256) : "Sin motivo";

        const saved = await setAfk(ctx.guild.id, invoker.id, reason);
        const sinceTs = Math.floor(new Date(saved?.createdAt ?? Date.now()).getTime() / 1000);

        await ctx.send(
          buildV2Payload(
            buildCompactCard({
              title: invoker.username,
              subtitle: "Estado AFK activado",
              body: fields([
                ["Motivo", clipV2Text(reason, 256)],
                ["Desde", `<t:${sinceTs}:R>`],
              ]),
              thumbnailUrl: invoker.displayAvatarURL({ size: 256 }),
              color: RED,
            })
          )
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

          const container = createContainer(RED);
          addButtonSection(
            container,
            `## :${clipV2Text(name, 80)}:\n-# ID ${code(id)} · ${animated ? "Animado (GIF)" : "Estático (PNG)"}`,
            "Abrir imagen",
            url
          );
          addSeparator(container, SeparatorSpacingSize.Small, false);
          container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url))
          );

          return ctx.send(buildV2Payload(container));
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
        const codepoints = filteredCps.map((cp) => `U+${cp.toUpperCase()}`).join(" ");

        const container = createContainer(RED);
        addButtonSection(
          container,
          `## ${raw}\n-# Código ${code(codepoints)}`,
          "Abrir imagen",
          highResUrl
        );
        addSeparator(container, SeparatorSpacingSize.Small, false);
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(highResUrl))
        );

        return ctx.send(buildV2Payload(container));
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
      const reply = await prepareReply(ctx);
      const texto = ctx.get("texto");
      const idioma = ctx.get("idioma") ?? "es";

      try {
        const { translate } = require("@vitalets/google-translate-api");
        const result = await translate(texto, { to: idioma });

        const origen = result.raw?.src ?? "auto";
        const traduccion = result.text;

        if (!traduccion) {
          return reply({ content: "No se pudo generar la traducción", flags: MessageFlags.Ephemeral });
        }

        const container = createContainer(RED);
        addTextBlock(container, `## Traducción\n-# ${formatLanguage(origen)} → ${formatLanguage(idioma)}`);
        addSeparator(container);
        addTextBlock(container, `### Original\n${quote(texto, 1300)}`);
        addSeparator(container, SeparatorSpacingSize.Small, false);
        addTextBlock(container, `### Resultado\n${quote(traduccion, 2100)}`);

        await reply(buildV2Payload(container));
      } catch (err) {
        log.error("[util translate]", { err: err?.message ?? String(err) });
        if (err.name === "TooManyRequestsError") {
          return reply({ content: "Google Translate está saturado, intenta en unos segundos", flags: MessageFlags.Ephemeral });
        }
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
        const prompt = "Describe detalladamente qué hay en esta imagen. Sé específico: colores, objetos, personas, texto visible, ambiente, estilo. Responde en español. Máximo 3 párrafos.";
        const texto = await generateVision(prompt, attachment.url);

        const header = `## Descripción de imagen\n-# ${formatAttachmentMeta(attachment, "imagen")}`;
        const container = createContainer(RED);
        addHeaderSection(container, [header], attachment.url);
        addSeparator(container);
        addTextBlock(container, budgetBodyText(texto ?? "No pude generar una descripción", header.length));

        await reply(buildV2Payload(container));
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
      const reply = await prepareReply(ctx, { thinking: true });
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

        const meta = formatAttachmentMeta(attachment, "audio");

        if (texto.length > 3600) {
          const fileContainer = createContainer(RED);
          addTextBlock(fileContainer, `## Transcripción\n-# ${meta} · ${num(texto.length)} caracteres`);
          addSeparator(fileContainer);
          addTextBlock(fileContainer, "El texto supera el límite del mensaje, se adjunta como archivo.");
          addSeparator(fileContainer, SeparatorSpacingSize.Small, false);
          const fileAtt = addAttachmentFile(fileContainer, Buffer.from(texto, "utf-8"), "transcripcion.txt");
          return reply(buildV2Payload(fileContainer, { files: [fileAtt] }));
        }

        const header = `## Transcripción\n-# ${meta}`;
        const container = createContainer(RED);
        addTextBlock(container, header);
        addSeparator(container);
        addTextBlock(container, budgetBodyText(texto, header.length));

        await reply(buildV2Payload(container));
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

      const isSlash = Boolean(ctx.interaction);
      if (isSlash) await ctx.interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let statusMsg = null;
      const sendStatus = async (container) => {
        const payload = buildV2Payload(container);
        if (isSlash) return ctx.interaction.editReply(payload);
        if (!statusMsg) {
          statusMsg = await ctx.send(payload);
          return statusMsg;
        }
        return statusMsg.edit(payload);
      };

      const author = ctx.user ?? ctx.author;
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
            buildDmStatusContainer({
              title: "Enviando DM masivo",
              guildName: ctx.guild.name,
              iconUrl: guildIcon,
              rows: [["Progreso", `${code(`${num(done)} / ${num(total)}`)} (${pct}%)`]],
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
        buildDmStatusContainer({
          title: "DM masivo completado",
          guildName: ctx.guild.name,
          iconUrl: guildIcon,
          rows: [
            ["Enviados", code(num(enviados))],
            ["Fallidos", code(num(fallidos))],
            ["Total", code(num(total))],
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
      const reply = await prepareReply(ctx, { thinking: true });
      const texto = ctx.get("texto");

      if (texto.length < 100) {
        return reply({ content: "El texto es demasiado corto para resumir", flags: MessageFlags.Ephemeral });
      }

      try {
        const resumen = await generateText(
          `Resume el siguiente texto. Solo el resumen, sin frases previas ni comentarios adicionales. Objetivo, fiel al contenido original, sin opiniones ni interpretaciones. Responde en español.\n\n${texto.slice(0, 8000)}`
        );

        const header = resumen
          ? `## Resumen\n-# ${num(texto.length)} → ${num(resumen.length)} caracteres`
          : "## Resumen";
        const container = createContainer(RED);
        addTextBlock(container, header);
        addSeparator(container);
        addTextBlock(container, budgetBodyText(resumen || "No pude generar un resumen", header.length));

        await reply(buildV2Payload(container));
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

      const ts = Math.floor(remindAt.getTime() / 1000);
      const container = createContainer(GREEN);
      addTextBlock(container, `## Recordatorio creado\n-# <t:${ts}:f> · <t:${ts}:R>`);
      addSeparator(container);
      addTextBlock(container, quote(texto, 1200));

      await ctx.send(buildV2Payload(container));
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

      const meta = formatAttachmentMeta(attachment, "imagen");

      if (texto.length > 3600) {
        const fileContainer = createContainer(RED);
        addHeaderSection(
          fileContainer,
          [
            `## Texto extraído\n-# ${meta} · ${num(texto.length)} caracteres`,
            "El texto supera el límite del mensaje, se adjunta como archivo.",
          ],
          attachment.url
        );
        addSeparator(fileContainer, SeparatorSpacingSize.Small, false);
        const fileAtt = addAttachmentFile(fileContainer, Buffer.from(texto, "utf-8"), "texto.txt");
        return reply(buildV2Payload(fileContainer, { files: [fileAtt] }));
      }

      const header = `## Texto extraído\n-# ${meta}`;
      const container = createContainer(RED);
      addHeaderSection(container, [header], attachment.url);
      addSeparator(container);
      addTextBlock(container, budgetBodyText(texto, header.length));

      await reply(buildV2Payload(container));
    } catch (err) {
      log.error("[util ocr]", { err: err?.message ?? String(err) });
      handleCommandError(ctx, err);
    }
  },
};

data.data.addCommand(pollCommand).addCommand(remindCommand).addCommand(ocrCommand);

module.exports = { data };
