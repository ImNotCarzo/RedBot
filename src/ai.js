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
      const isErrorRequiringFallback =
        status === 503 ||
        status === 500 ||
        is429 ||
        (err?.message ?? "").includes("503") ||
        (err?.message ?? "").includes("500") ||
        (err?.message ?? "").includes("UNAVAILABLE") ||
        (err?.message ?? "").includes("INTERNAL") ||
        (err?.message ?? "").includes("high demand") ||
        (err?.message ?? "").includes("overloaded");

      // Si el modelo actual está saturado (503/high demand), con 500 INTERNAL o con 429 y tenemos fallbackModel, alternamos inmediatamente
      if (fallbackModel && isErrorRequiringFallback && requestParams.model !== fallbackModel) {
        log.warn(`Modelo ${requestParams.model} falló (${status || "error"}); alternando a fallback: ${fallbackModel}`);
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

/** Obtiene anclaje temporal exacto para eliminar el sesgo de knowledge cutoff de 2024. */
function getTemporalPrompt() {
  const now = new Date();
  const opciones = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Mexico_City",
  };
  const fechaHoy = now.toLocaleDateString("es-ES", opciones);
  const ayer = new Date(now.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString("es-ES", opciones);
  const anio = now.getFullYear();

  return `\n\n[Contexto temporal del sistema]:
- Hoy es: ${fechaHoy}.
- Ayer fue: ${ayer}.
- Año en curso: ${anio}.
- IMPORTANTE: Usa siempre este marco temporal como presente real. Si te preguntan qué fecha es hoy, qué fecha fue ayer o en qué año estamos, responde con certeza usando esta información.`;
}

/** Limpia saludos, menciones y muletillas conversacionales para obtener una búsqueda limpia. */
function extractSearchQuery(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.trim();
  if (t.length < 3) return null;

  let cleaned = t
    .replace(/<@!?\d+>/g, "")
    .replace(/^(hola|buenas|hey|oye|ey|bot|redbot|dime|sabes|por favor|me dices|busca|buscar|que sabes de|que paso con)[\s,:]+/gi, "")
    .replace(/[¿?]/g, "")
    .trim();

  return cleaned.length >= 3 ? cleaned : null;
}

/** Detecta de forma inteligente si la consulta se beneficia de búsqueda web en DuckDuckGo. */
function shouldSearchWeb(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.toLowerCase().trim();

  // Charla casual o saludos simples no requieren búsqueda
  if (/^(hola|buenas|hey|que tal|como estas|quien eres|gracias|chau|adios|jaja|xd|ok|dale|bueno)[\s!.,?]*$/i.test(t)) {
    return false;
  }

  // Consultas sobre fecha y hora ya las resuelve el contexto temporal
  if (/que (dia|fecha|hora) (es|era|fue|sera) (hoy|ayer|manana)/i.test(t)) {
    return false;
  }

  // Palabras clave de actualidad, eventos, entidades o noticias
  const triggerWords = [
    "busca", "buscar", "noticia", "noticias", "quien gano", "quién ganó", "campeon", "campeón",
    "partido", "resultado", "precio", "clima", "estreno", "lanzamiento", "actual", "actualidad",
    "cuando sale", "cuándo sale", "quien es", "quién es", "año 202", "versión", "version",
    "nuevo", "nueva", "último", "ultimos", "falleció", "murió", "presidente", "gobierno",
    "dolar", "dólar", "bitcoin", "cripto", "elon musk", "spacex", "openai", "guerra",
    "conflicto", "champions", "mundial", "copa", "liga", "fichaje", "update", "actualizacion"
  ];
  if (triggerWords.some((kw) => t.includes(kw))) return true;

  // Preguntas interrogativas
  if (t.includes("?") || t.includes("¿")) {
    const questionWords = ["quien", "quién", "que", "qué", "cuando", "cuándo", "donde", "dónde", "como", "cómo", "cual", "cuál", "cuanto", "cuánto"];
    if (questionWords.some((qw) => t.includes(qw))) return true;
  }

  return false;
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

/** Respuesta de chat con persona + temporalidad + Web Search en vivo integrado. */
async function generateChatReply(historial) {
  const lastUserMsg = Array.isArray(historial)
    ? [...historial].reverse().find((m) => m && m.role === "user")?.content ?? ""
    : "";

  let systemPromptWithContext = SYSTEM_PROMPT + getTemporalPrompt();

  // Si la pregunta requiere datos actuales o investigación, buscamos en DuckDuckGo con query limpia
  if (shouldSearchWeb(lastUserMsg)) {
    const searchQuery = extractSearchQuery(lastUserMsg) || lastUserMsg;
    const webSnippets = await performWebSearch(searchQuery);
    if (webSnippets.length > 0) {
      systemPromptWithContext += `\n\n[Información web reciente en vivo encontrada en DuckDuckGo para "${searchQuery}"]:\n${webSnippets.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nUsa estos datos web si son relevantes para contestar con certeza y datos actuales.`;
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
