const { GatewayIntentBits, Partials } = require("discord.js");

const REQUIRED_ENV = ["TOKEN", "MONGO", "CLIENT_ID"];

function validateEnv() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Falta variable de entorno requerida: ${key}`);
    }
  }

  return {
    TOKEN: process.env.TOKEN,
    MONGO: process.env.MONGO,
    CLIENT_ID: process.env.CLIENT_ID,
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    NODE_ENV: process.env.NODE_ENV || "development",
    GEMINI: process.env.GEMINI,
    GEMINI2: process.env.GEMINI2,
    GROQ: process.env.GROQ,
  };
}

const botOptions = {
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
  bindProcessHandlers: false,
};

const dbOptions = {
  retryAttempts: 5,
  retryDelay: 2000,
  options: {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 15_000,
    maxPoolSize: 15,
  },
};

const MAX_HISTORIAL = 10;
const MAX_EMBED_DESCRIPTION = 4096;
const AI_MODEL_DEFAULT = "gemini-3.1-flash-lite";
const AI_MODEL_SEARCH = "gemini-2.5-flash";
const COMMANDS_TO_UPDATE = ["help", "ask", "util", "fun", "user"];

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

module.exports = {
  REQUIRED_ENV,
  validateEnv,
  botOptions,
  dbOptions,
  MAX_HISTORIAL,
  MAX_EMBED_DESCRIPTION,
  AI_MODEL_DEFAULT,
  AI_MODEL_SEARCH,
  COMMANDS_TO_UPDATE,
  SYSTEM_PROMPT,
};
