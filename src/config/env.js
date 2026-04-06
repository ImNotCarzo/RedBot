const REQUIRED_ENV = ["TOKEN", "MONGO", "CLIENT_ID"];

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
    OPENROUTER:     process.env.OPENROUTER,
    GEMINI:         process.env.GEMINI,
    GEMINI2:        process.env.GEMINI2,
    GROQ:           process.env.GROQ,
  };
}

module.exports = { validateEnv, REQUIRED_ENV };
