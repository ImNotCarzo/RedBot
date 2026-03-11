require("dotenv").config();
const { Erine, GatewayIntentBits } = require("erine");
const { Partials, REST, Routes, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const GuildConfig  = require("./models/GuildConfig");
const prefixCache  = require("./utils/prefixCache");
const { scheduleTempUnban, TempBan } = require("./commands/mod");
const { MAX_HISTORIAL, setConversacion, getConversacion } = require("./utils/askMemory");

// ─────────────────────────────────────────────
//  AI
// ─────────────────────────────────────────────

const GEMINI_KEYS = [process.env.GEMINI, process.env.GEMINI2].filter(Boolean);
let currentKey = 0;

function getAI() {
  return new GoogleGenAI({ apiKey: GEMINI_KEYS[currentKey] });
}

function rotateKey() {
  currentKey = (currentKey + 1) % GEMINI_KEYS.length;
  console.log(`[AI] Rotando a key ${currentKey + 1}`);
}

async function generateWithFallback(params) {
  try {
    return await getAI().models.generateContent(params);
  } catch (err) {
    if (err.status === 429 && GEMINI_KEYS.length > 1) {
      rotateKey();
      return await getAI().models.generateContent(params);
    }
    throw err;
  }
}

async function needsSearchAI(pregunta) {
  try {
    const res = await getAI().models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{
        role: "user",
        parts: [{ text: `Answer only YES or NO. Does this question require current or real-time information from the internet (news, weather, sports results, prices, events, updates)?\nQuestion: ${pregunta}` }],
      }],
    });
    return res.text.trim().toLowerCase().includes("yes");
  } catch {
    return false;
  }
}

function toGeminiHistory(historial) {
  return historial.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

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
    GatewayIntentBits.DirectMessageTyping,
  ],
  partials: [Partials.Channel, Partials.Message],
  guildOnly: false,
  prefix: async (ctx) => {
    const message = ctx.data;
    if (!message?.content || message?.author?.bot) return null;

    const content = message.content;
    const botId   = message.client?.user?.id;

    // Mención como prefijo
    if (botId) {
      if (content.startsWith(`<@${botId}>`))  return `<@${botId}>`;
      if (content.startsWith(`<@!${botId}>`)) return `<@!${botId}>`;
    }

    const guildId = message.guildId;

    // En DMs siempre usar "."
    if (!guildId) {
      return content.startsWith(".") ? "." : null;
    }

    // Prefix desde caché o DB
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
//  COMMANDS & LOGIN
// ─────────────────────────────────────────────

bot.load("commands");
bot.login(process.env.TOKEN);
bot.setMaxListeners(20);

// ─────────────────────────────────────────────
//  EVENTS (archivos en /events)
// ─────────────────────────────────────────────

const eventsPath  = path.join(__dirname, "events");
const eventFiles  = fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (!event?.data?.name) continue;
  bot.on(event.data.name, (...args) => event.data.code(bot, ...args));
}

console.log(`[Events] ${eventFiles.length} cargados`);

// ─────────────────────────────────────────────
//  READY — sync, context patch, tempbans
// ─────────────────────────────────────────────

const COMMANDS_TO_UPDATE = ["ask", "user", "askreset", "ping", "botinfo", "invite", "fun"];

bot.on("clientReady", async (bot) => {
  await bot.sync();
  console.log("[Commands] Sincronizados");

  // Parchear integration_types y contexts
  try {
    const rest     = new REST().setToken(process.env.TOKEN);
    const commands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));

    for (const cmd of commands) {
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

  // Restaurar tempbans persistentes
  try {
    const pending = await TempBan.find({});
    if (pending.length) {
      console.log(`[TempBan] Restaurando ${pending.length} tempban(s)...`);
      for (const entry of pending) {
        scheduleTempUnban(bot, entry.guildId, entry.userId, entry.unbanAt);
      }
      console.log("[TempBan] Restaurados");
    }
  } catch (err) {
    console.error("[TempBan] Error al restaurar:", err);
  }
});

// ─────────────────────────────────────────────
//  MESSAGE CREATE — reply-based IA conversation
// ─────────────────────────────────────────────

bot.on("messageCreate", async (message) => {
  try {
    if (message.author.bot)              return;
    if (!message.reference?.messageId)   return;

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
      .setColor("Red");

    const botMsg = await message.reply({ embeds: [embed] });
    setConversacion(message.author.id, historial, botMsg.id);

  } catch (err) {
    console.error("[messageCreate IA]", err);
  }
});

// ─────────────────────────────────────────────
//  UNHANDLED ERRORS
// ─────────────────────────────────────────────

process.on("unhandledRejection", (err) => console.error("[UnhandledRejection]", err));
process.on("uncaughtException",  (err) => console.error("[UncaughtException]",  err));