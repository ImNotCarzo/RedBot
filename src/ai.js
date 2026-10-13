const { GoogleGenAI } = require("@google/genai");
const Logger = require("./logger");
const {
  MAX_HISTORIAL,
  SYSTEM_PROMPT,
  AI_MODEL_CHAT,
  AI_MODEL_CHAT_FALLBACK,
  AI_MODEL_FAST,
} = require("./config");
const { wait } = require("./runtime");

const log = new Logger("AI_SERVICE", process.env.LOG_LEVEL);
const GEMINI_KEYS = [process.env.GEMINI, process.env.GEMINI2].filter(Boolean);
const aiClients = new Map();
let currentKey = 0;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ATTEMPTS = 3;
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 2000;
const sessions = new Map();

function getCurrentApiKey() {
  return GEMINI_KEYS[currentKey] ?? null;
}

function getAI() {
  const apiKey = getCurrentApiKey();
  if (!apiKey) {
    throw new Error("No hay ninguna clave API de Gemini configurada");
  }
  if (!aiClients.has(apiKey)) {
    aiClients.set(apiKey, new GoogleGenAI({ apiKey }));
  }
  return aiClients.get(apiKey);
}

function rotateKey() {
  if (GEMINI_KEYS.length <= 1) return;
  currentKey = (currentKey + 1) % GEMINI_KEYS.length;
}

function isRetriableAIError(err) {
  const status = Number(err?.status ?? err?.code ?? 0);
  if (status === 429) return true;
  if (status >= 500) return true;
  const msg = (err?.message ?? "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnreset") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("overloaded")
  );
}

async function withAITimeout(promise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`AI timeout (${timeoutMs}ms)`)), timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function generateWithFallback(params, options = {}) {
  if (!params || typeof params !== "object") {
    throw new TypeError("Parámetros de AI inválidos");
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, Number.isFinite(options.maxAttempts) ? options.maxAttempts : DEFAULT_ATTEMPTS);
  const fallbackModel = options.fallbackModel || null;

  let requestParams = { ...params };
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withAITimeout(getAI().models.generateContent(requestParams), timeoutMs);
    } catch (err) {
      lastErr = err;
      const status = Number(err?.status ?? err?.code ?? 0);
      const is429 = status === 429 || (err?.message ?? "").includes("429");
      const isOverloaded =
        status === 503 ||
        (err?.message ?? "").includes("503") ||
        (err?.message ?? "").includes("UNAVAILABLE") ||
        (err?.message ?? "").includes("high demand") ||
        (err?.message ?? "").includes("overloaded");

      // Si el modelo actual está saturado (503/high demand) o con 429 y tenemos fallbackModel, alternamos inmediatamente
      if (fallbackModel && (isOverloaded || is429) && requestParams.model !== fallbackModel) {
        log.warn(`Modelo ${requestParams.model} con sobrecarga/límite; alternando a fallback: ${fallbackModel}`);
        requestParams.model = fallbackModel;
        continue;
      }

      const canRotate = is429 && GEMINI_KEYS.length > 1;
      const canRetry = attempt < maxAttempts && (canRotate || isRetriableAIError(err));

      if (!canRetry) break;

      if (canRotate) {
        rotateKey();
        log.warn("Rate limit en Gemini; rotando API key", { attempt });
      } else {
        log.warn("Error transitorio en IA; reintentando", { attempt, err: err?.message ?? String(err) });
      }

      await wait(Math.min(1000 * (2 ** (attempt - 1)), 4000));
    }
  }

  const finalErr = lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Error desconocido de IA"));
  finalErr.message = `AI generation failed: ${finalErr.message}`;
  throw finalErr;
}

function toGeminiHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.content === "string" && (m.role === "assistant" || m.role === "user"))
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
}

/** Búsqueda web ligera vía DuckDuckGo para enriquecer el contexto con información actual. */
async function performWebSearch(query) {
  if (!query || typeof query !== "string") return [];
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.slice(0, 150))}`;
    const res = await withAITimeout(
      fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
      }),
      4000
    );
    if (!res.ok) return [];
    const html = await res.text();
    const snippets = [];
    const regex = /<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) && snippets.length < 4) {
      const text = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text) snippets.push(text);
    }
    return snippets;
  } catch {
    return [];
  }
}

/** Detecta heurísticamente si una consulta pide información reciente/actual o datos en vivo. */
function needsWebSearch(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.toLowerCase();
  const searchTriggers = [
    "noticia", "noticias", "quien gano", "quién ganó", "campeon", "campeón",
    "partido", "resultado", "hoy", "ayer", "precio", "clima", "estreno",
    "actual", "actualidad", "cuando sale", "cuándo sale", "quien es", "quién es",
    "año 202", "versión", "version", "nuevo", "nueva", "busca", "buscar"
  ];
  return searchTriggers.some((kw) => t.includes(kw));
}

/** Respuesta de chat con persona + historial + Web Search en vivo integrado. */
async function generateChatReply(historial) {
  const lastUserMsg = Array.isArray(historial)
    ? [...historial].reverse().find((m) => m && m.role === "user")?.content ?? ""
    : "";

  let systemPromptWithContext = SYSTEM_PROMPT;

  // Si la pregunta requiere datos actuales, buscamos en la web e inyectamos la información
  if (needsWebSearch(lastUserMsg)) {
    const webSnippets = await performWebSearch(lastUserMsg);
    if (webSnippets.length > 0) {
      systemPromptWithContext += `\n\n[Información web reciente en vivo encontrada]:\n${webSnippets.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nUsa estos datos si son relevantes para contestar con certeza.`;
    }
  }

  const contents = [
    { role: "user", parts: [{ text: systemPromptWithContext }] },
    { role: "model", parts: [{ text: "Entendido." }] },
    ...toGeminiHistory(historial),
  ];

  const response = await generateWithFallback(
    {
      model: AI_MODEL_CHAT,
      contents,
    },
    { fallbackModel: AI_MODEL_CHAT_FALLBACK }
  );

  return response.text?.trim() || "No pude generar una respuesta";
}

function assertUserId(userId) {
  if (!userId || typeof userId !== "string") throw new TypeError("userId inválido");
}

function clearSessionTimeout(session) {
  if (session?.timeout) clearTimeout(session.timeout);
}

function evictIfNeeded() {
  while (sessions.size >= MAX_SESSIONS) {
    const oldestKey = sessions.keys().next().value;
    if (!oldestKey) break;
    const oldest = sessions.get(oldestKey);
    clearSessionTimeout(oldest);
    sessions.delete(oldestKey);
  }
}

function setConversacion(userId, historial, lastBotMessageId) {
  assertUserId(userId);

  const current = sessions.get(userId);
  if (current) clearSessionTimeout(current);

  evictIfNeeded();

  const timeout = setTimeout(() => {
    const session = sessions.get(userId);
    if (session) clearSessionTimeout(session);
    sessions.delete(userId);
  }, SESSION_TTL_MS);
  timeout.unref();

  sessions.set(userId, {
    historial: Array.isArray(historial) ? historial.slice(-MAX_HISTORIAL) : [],
    lastBotMessageId: lastBotMessageId ?? null,
    updatedAt: Date.now(),
    timeout,
  });
}

function getConversacion(userId) {
  assertUserId(userId);
  const session = sessions.get(userId);
  if (!session) return null;
  sessions.delete(userId);
  sessions.set(userId, session);
  return session;
}

function deleteConversacion(userId) {
  assertUserId(userId);
  const session = sessions.get(userId);
  if (session) clearSessionTimeout(session);
  sessions.delete(userId);
}

module.exports = {
  getAI,
  generateWithFallback,
  generateChatReply,
  toGeminiHistory,
  setConversacion,
  getConversacion,
  deleteConversacion,
};
