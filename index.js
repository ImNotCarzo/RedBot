require("dotenv").config();
const { Erine, GatewayIntentBits } = require("erine");
const { Partials, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const GuildConfig  = require("./models/GuildConfig");
const prefixCache  = require("./utils/prefixCache");
const { setId }    = require("./utils/commandIds");
const { MAX_HISTORIAL, setConversacion, getConversacion } = require("./utils/askMemory");
const { generateWithFallback, needsSearchAI, toGeminiHistory } = require("./utils/ai");
const { resolveMemberFlexible } = require("./utils/helpers");

const SYSTEM_PROMPT = `Eres RedBot, un asistente dentro de un bot de Discord.
Personalidad: sarcástico, ingenioso e irreverente pero sin pasarte de la raya.
Hablas como un amigo que sabe mucho, no como un manual técnico ni un bot genérico.
Hablas español neutro, sin regionalismos de ningún país específico. Usas español informal y neutro, sin voseo de base o algún otro tipo de acento, sin "usted" y sin formalismos, a menos que el usuario te escriba así, por ejemplo si usa voseo le respondes con eso, sino neutral.
Sin emojis salvo que realmente sumen al mensaje.
Si alguien pregunta algo obvio lo respondes con un toque de "en serio me preguntas eso?".
Si alguien te insulta respondes con ingenio, no con sumisión.
Si la pregunta es técnica la respondes bien pero sin sonar a wikipedia.
Jamás uses frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!" ni nada por el estilo.
Respondes en el mismo idioma que el usuario.
Mantén el contexto de la conversación.`;

// ─────────────────────────────────────────────
//  BOT
// ─────────────────────────────────────────────

const bot = new Erine({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
  guildOnly: false,
  prefix: async (ctx) => {
    const message = ctx.data;
    if (!message?.content || message?.author?.bot) return null;

    const content = message.content;
    const botId   = message.client?.user?.id;

    if (botId) {
      if (content.startsWith(`<@${botId}>`))  return `<@${botId}>`;
      if (content.startsWith(`<@!${botId}>`)) return `<@!${botId}>`;
    }

    const guildId = message.guildId;

    if (!guildId) {
      return content.startsWith(".") ? "." : null;
    }

    let prefix = ".";
    if (prefixCache.has(guildId)) {
      prefix = prefixCache.get(guildId);
    } else {
      const config = await GuildConfig.findOne({ guildId });
      prefix = config?.prefix ?? ".";
      prefixCache.set(guildId, prefix);
    }

    return content.startsWith(prefix) ? prefix : null;
  },
});

// ─────────────────────────────────────────────
//  DB
// ─────────────────────────────────────────────

mongoose
  .connect(process.env.MONGO)
  .then(() => console.log("[DB] Conectado"))
  .catch((err) => console.error("[DB] Error:", err));

// ─────────────────────────────────────────────
//  WRAP
// ─────────────────────────────────────────────

function normalizeReplyPayload(payload) {
  if (typeof payload === "string") return { content: payload };
  if (Array.isArray(payload)) return { content: payload.join("\n") };
  if (!payload || typeof payload !== "object") return { content: String(payload ?? "") };
  return payload;
}

const wrappedOriginalCodes = new WeakSet();
const slashCommandMap = new Map();
const DISCORD_ID_PATTERN = /^\d{17,20}$/;

const PREFIXED_TO_SLASH = {
  channel: "channel/info",
  channelclone: "channel/clone",
  channelunlock: "channel/unlock",
  role: "role/info",
  roleadd: "role/add",
  roleall: "role/all",
  rolebots: "role/bots",
  rolehoist: "role/hoist",
  rolehumans: "role/humans",
  roleicon: "role/icon",
  rolejoin: "role/join",
  rolementionable: "role/mentionable",
  roleremove: "role/remove",
  roleremoveall: "role/removeall",
  rolerename: "role/rename",
  roleusers: "role/users",
  roleperms: "role/permissions",
  server: "server/info",
  serverroles: "server/roles",
  serverbanner: "server/banner",
  sroles: "server/roles",
  ubanner: "user/banner",
  user: "user/info",
  userbanner: "user/banner",
  uroles: "user/roles",
  userperms: "user/permissions",
};

function inferGroupFromPrefixedFile(file, prefixedName) {
  const base = file.replace(/\.js$/, "");
  if (base.startsWith("channel")) return "channel";
  if (base.startsWith("fun")) return "fun";
  if (base.startsWith("mod")) return "mod";
  if (base.startsWith("role")) return "role";
  if (base.startsWith("server")) return "server";
  if (base.startsWith("user")) return "user";
  if (base.startsWith("util")) return "util";
  if (prefixedName === "ask") return "ask";
  return null;
}

function loadSlashCommandMap() {
  if (slashCommandMap.size) return;
  const slashFiles = ["channel", "fun", "mod", "role", "server", "user", "util"];
  for (const file of slashFiles) {
    const mod = require(path.join(__dirname, "commands", `${file}.js`));
    const group = mod?.data?.data;
    const commands = group?.commands ?? [];
    for (const cmd of commands) {
      const name = cmd?.data?.name;
      if (name) slashCommandMap.set(`${file}/${name}`, cmd);
    }
  }
  const ask = require(path.join(__dirname, "commands", "ask.js"))?.data;
  if (ask?.data?.name) slashCommandMap.set(`ask/${ask.data.name}`, ask);
}

function parseMaybeNumber(value) {
  if (typeof value !== "string") return null;
  return /^\d+$/.test(value) ? value : null;
}

function looksLikeLanguageToken(token) {
  if (typeof token !== "string") return false;
  const normalized = token.toLowerCase();
  const known = new Set([
    "es", "español", "espanol", "en", "inglés", "ingles", "fr", "francés", "frances",
    "de", "alemán", "aleman", "it", "italiano", "pt", "portugués", "portugues",
    "ru", "ruso", "ja", "japonés", "japones", "ko", "coreano", "zh", "chino",
    "ar", "árabe", "arabe", "hi", "hindi",
  ]);
  return known.has(normalized);
}

async function resolveRoleFlexible(ctx, input) {
  if (!ctx?.guild || !input) return null;
  const mention = input.match(/^<@&(\d{17,20})>$/)?.[1];
  const roleId = mention ?? (DISCORD_ID_PATTERN.test(input) ? input : null);
  if (roleId) {
    const byId = await ctx.guild.roles.fetch(roleId).catch(() => null);
    if (byId) return byId;
  }
  const lower = input.toLowerCase();
  return ctx.guild.roles.cache.find((r) => r.name.toLowerCase().includes(lower)) ?? null;
}

async function resolveChannelFlexible(ctx, input) {
  if (!ctx?.guild || !input) return null;
  const mention = input.match(/^<#(\d{17,20})>$/)?.[1];
  const channelId = mention ?? (DISCORD_ID_PATTERN.test(input) ? input : null);
  if (channelId) {
    const byId = await ctx.guild.channels.fetch(channelId).catch(() => null);
    if (byId) return byId;
  }
  const lower = input.toLowerCase();
  return ctx.guild.channels.cache.find((c) => c.name?.toLowerCase?.().includes(lower)) ?? null;
}

function buildAttachmentFromInput(ctx, input) {
  const attached = ctx.message?.attachments?.first?.();
  if (attached) return attached;
  if (!input || !/^https?:\/\//i.test(input)) return null;
  const name = input.split("/").pop()?.split("?")[0] ?? "archivo";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const imageTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  const audioTypes = { mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "video/webm", m4a: "audio/mp4", flac: "audio/flac" };
  return {
    name,
    url: input,
    contentType: imageTypes[ext] ?? audioTypes[ext] ?? null,
    size: 0,
  };
}

async function parsePrefixedArgsForSlash(ctx, slashCommand, slashName) {
  const defs = slashCommand?.params?.params ?? [];
  const args = [...(ctx.args ?? [])];
  const values = {};
  let missingRequired = false;

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const isLast = i === defs.length - 1;
    const token = args[0];
    let value = null;

    if (def.type === 6) {
      if (token) {
        value = await resolveMemberFlexible(ctx, token);
        if (value) args.shift();
      }
    } else if (def.type === 8) {
      if (token) {
        value = await resolveRoleFlexible(ctx, token);
        if (value) args.shift();
      }
    } else if (def.type === 7) {
      if (token) {
        value = await resolveChannelFlexible(ctx, token);
        if (value) args.shift();
      }
    } else if (def.type === 11) {
      value = buildAttachmentFromInput(ctx, token);
      if (!ctx.message?.attachments?.size && value) args.shift();
    } else if (def.type === 3) {
      if (args.length) {
        if (
          slashName === "translate" &&
          def.name === "texto" &&
          args.length > 1 &&
          looksLikeLanguageToken(args[args.length - 1])
        ) {
          value = args.slice(0, -1).join(" ");
          args.splice(0, args.length - 1);
        } else if (isLast || slashName === "resume") value = args.splice(0).join(" ");
        else if (def.name === "dias") value = parseMaybeNumber(token) ?? token;
        else value = args.shift();
      }
    } else if (args.length) {
      value = args.shift();
    }

    const normalizedValue = value ?? null;
    values[def.name] = normalizedValue;
    if (def.required && normalizedValue === null) missingRequired = true;
  }
  return { values, missingRequired };
}

function wrapPrefixedCommands() {
  loadSlashCommandMap();
  const prefixedPath  = path.join(__dirname, "commands", "prefixed");
  const prefixedFiles = fs.readdirSync(prefixedPath).filter(f => f.endsWith(".js"));

  for (const file of prefixedFiles) {
    const commandModule = require(path.join(prefixedPath, file));
    const command       = commandModule?.data;
    const originalCode  = command?.code;

    if (typeof originalCode !== "function" || wrappedOriginalCodes.has(originalCode)) continue;

    command.code = async function (ctx, ...args) {
      const originalReply = ctx?.message?.reply?.bind(ctx.message);

      if (originalReply) {
        ctx.send = (payload) => {
          const normalized = normalizeReplyPayload(payload);

          return originalReply({
            ...normalized,
            allowedMentions: {
              ...normalized.allowedMentions,
              repliedUser: false,
            },
          });
        };
      }

      const prefixedName = command?.data?.name;
      const inferredGroup = inferGroupFromPrefixedFile(file, prefixedName);
      const slashKey = PREFIXED_TO_SLASH[prefixedName] ?? (inferredGroup ? `${inferredGroup}/${prefixedName}` : null);
      const slashName = slashKey?.split("/")[1];
      const slashCommand = slashKey ? slashCommandMap.get(slashKey) : null;

      if (slashCommand?.code) {
        try {
          const parsedValues = await parsePrefixedArgsForSlash(ctx, slashCommand, slashName);
          if (!parsedValues) return;
          if (parsedValues.missingRequired) {
            return await originalCode.call(this, ctx, ...args);
          }
          const originalGet = ctx.get?.bind(ctx);
          const hadUser = Object.prototype.hasOwnProperty.call(ctx, "user");
          const originalUser = ctx.user;
          ctx.get = (name) => parsedValues.values[name] ?? null;
          if (!ctx.user && ctx.author) ctx.user = ctx.author;
          try {
            return await slashCommand.code(ctx, ...args);
          } finally {
            if (originalGet) ctx.get = originalGet;
            else delete ctx.get;
            if (hadUser) ctx.user = originalUser;
            else delete ctx.user;
          }
        } catch (err) {
          console.error(`[adapter:${slashName}]`, err);
          return ctx.send("Ocurrió un error ejecutando el comando");
        }
      }

      try {
        return await originalCode.call(this, ctx, ...args);
      } catch (err) {
        console.error(`[${command?.data?.name ?? file}]`, err);
        return ctx.send("Ocurrió un error ejecutando el comando");
      }
    };

    wrappedOriginalCodes.add(originalCode);
  }
}

// ─────────────────────────────────────────────
//  LOADERS
// ─────────────────────────────────────────────

bot.load("commands");
wrapPrefixedCommands();
bot.login(process.env.TOKEN);
bot.setMaxListeners(20);

// ─────────────────────────────────────────────
//  EVENTS
// ─────────────────────────────────────────────

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (!event?.data?.name) continue;
  bot.on(event.data.name, (...args) => event.data.code(bot, ...args));
}

console.log(`[Events] ${eventFiles.length} cargados`);

// ─────────────────────────────────────────────
//  READY
// ─────────────────────────────────────────────

const COMMANDS_TO_UPDATE = ["help", "ask", "util", "fun", "user"];

bot.on("clientReady", async (bot) => {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/applications/${process.env.CLIENT_ID}/role-connections/metadata`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Bot ${process.env.TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          { key: "servidores", name: "Servidores", description: "Servidores", type: 2 }
        ]),
      }
    );
    if (!res.ok) {
      console.error("[Setup] No se pudo actualizar role connections metadata");
    }
  } catch {
    console.error("[Setup] Error al actualizar role connections metadata");
  }
  await bot.sync();
  console.log("[Commands] Sincronizados");

  try {
    const rest     = new REST().setToken(process.env.TOKEN);
    const commands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));

    for (const cmd of commands) {
      setId(cmd.name, cmd.id);

      if (!COMMANDS_TO_UPDATE.includes(cmd.name)) continue;
      await rest.patch(Routes.applicationCommand(process.env.CLIENT_ID, cmd.id), {
        body: {
          integration_types: [0, 1],
          contexts: [0, 1, 2],
        },
      });
      console.log(`[Contexts] Actualizado: ${cmd.name}`);
    }

    console.log("[Contexts] Todos actualizados");
  } catch (err) {
    console.error("[Contexts] Error:", err);
  }
});

// ─────────────────────────────────────────────
//  MESSAGE CREATE — ASK
// ─────────────────────────────────────────────

bot.on("messageCreate", async (message) => {
  try {
    if (message.author.bot)            return;
    if (!message.reference?.messageId) return;

    const userData = getConversacion(message.author.id);
    if (!userData) return;
    if (message.reference.messageId !== userData.lastBotMessageId) return;

    const pregunta = message.content.trim();
    if (!pregunta) return;

    await message.channel.sendTyping().catch(() => {});

    const historial = userData.historial;
    historial.push({ role: "user", content: pregunta });

    const usarSearch = await needsSearchAI(pregunta);
    const model      = usarSearch ? "gemini-2.5-flash" : "gemini-3.1-flash-lite-preview";
    const config     = usarSearch ? { tools: [{ googleSearch: {} }] } : {};

    const response = await generateWithFallback({
      model,
      contents: [
        { role: "user",  parts: [{ text: SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "Entendido." }] },
        ...toGeminiHistory(historial),
      ],
      config,
    });

    const respuesta = response.text?.trim() ?? "No pude generar una respuesta";

    historial.push({ role: "assistant", content: respuesta });
    if (historial.length > MAX_HISTORIAL) {
      historial.splice(0, historial.length - MAX_HISTORIAL);
    }

    const texto = respuesta.length > 4000
      ? respuesta.slice(0, 4000) + "\n*(respuesta recortada)*"
      : respuesta;

    const embed = new EmbedBuilder()
      .setAuthor({
        name:    message.author.username,
        iconURL: message.author.displayAvatarURL({ size: 128 }),
      })
      .setDescription(texto)
      .setColor("#ff383d");

    const botMsg = await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    setConversacion(message.author.id, historial, botMsg.id);

  } catch (err) {
    console.error("[messageCreate IA]", err);
  }
});

// ─────────────────────────────────────────────
//  UNHANDLED ERRORS
// ─────────────────────────────────────────────

process.on("SIGTERM", () => console.log("[Process] SIGTERM recibido - Shut"));
process.on("SIGINT",  () => console.log("[Process] SIGINT recibido"));
process.on("unhandledRejection", (err) => console.error("[UnhandledRejection]", err));
process.on("uncaughtException",  (err) => console.error("[UncaughtException]",  err));
