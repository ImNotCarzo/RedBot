const REQUIRED_ENV = ["TOKEN", "MONGO", "CLIENT_ID"];

/**
 * Validates required environment variables and returns a typed config object.
 * @returns {{ TOKEN: string, MONGO: string, CLIENT_ID: string, LOG_LEVEL: string, NODE_ENV: string, GOOGLE_API_KEY: string|undefined, GROQ_API_KEY: string|undefined }}
 */
function validateEnv() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Falta variable de entorno requerida: ${key}`);
    }
  }

  return {
    TOKEN:          process.env.TOKEN,
    MONGO:          process.env.MONGO,
    CLIENT_ID:      process.env.CLIENT_ID,
    LOG_LEVEL:      process.env.LOG_LEVEL  || "info",
    NODE_ENV:       process.env.NODE_ENV   || "development",
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GROQ_API_KEY:   process.env.GROQ_API_KEY,
  };
}

module.exports = { validateEnv, REQUIRED_ENV };
