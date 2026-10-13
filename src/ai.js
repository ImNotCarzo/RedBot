const { GoogleGenAI } = require("@google/genai");
const Logger = require("./logger");
const {
  MAX_HISTORIAL,
  SYSTEM_PROMPT,
  AI_MODEL_CHAT,
  AI_MODEL_CHAT_FALLBACK,
  AI_MODEL_FAST,
  AI_MODEL_FAST_FALLBACK,
  AI_MODEL_VISION,
  AI_MODEL_VISION_FALLBACK,
} = require("./config");
const { wait } = require("./runtime");

const log = new Logger("AI_SERVICE", process.env.LOG_LEVEL);
const GEMINI_KEYS = [process.env.GEMINI, process.env.GEMINI2].filter(Boolean);
const aiClients = new Map();
let currentKey = 0;

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_ATTEMPTS = 3;
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 2000;
const sessions = new Map();

const FALLBACK_CHAIN = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
];

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
  if (status === 429 || status >= 500) return true;
  const msg = (err?.message ?? "").toLowerCase();
  return (
    msg.includes("500") ||
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("internal") ||
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

function getNextModel(currentModel, preferredFallback, triedModels) {
  if (preferredFallback && !triedModels.has(preferredFallback)) {
    return preferredFallback;
  }
  for (const candidate of FALLBACK_CHAIN) {
    if (candidate !== currentModel && !triedModels.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function generateWithFallback(params, options = {}) {
  if (!params || typeof params !== "object") {
    throw new TypeError("Parámetros de AI inválidos");
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, Number.isFinite(options.maxAttempts) ? options.maxAttempts : DEFAULT_ATTEMPTS);
  const fallbackModel = options.fallbackModel || null;

  const triedModels = new Set([params.model]);
  let requestParams = {
    ...params,
    config: { ...(params.config || {}) },
  };

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withAITimeout(getAI().models.generateContent(requestParams), timeoutMs);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err ?? "");
      const status = Number(err?.status ?? err?.code ?? 0);
      const is429 = status === 429 || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
      const isModelFailure =
        status === 500 ||
        status === 503 ||
        status === 404 ||
        is429 ||
        msg.includes("500") ||
        msg.includes("503") ||
        msg.includes("INTERNAL") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("AI timeout") ||
        msg.includes("high demand") ||
        msg.includes("overloaded");

      if (is429 && GEMINI_KEYS.length > 1) {
        rotateKey();
        log.warn("Rate limit en Gemini; rotando API key", { attempt, model: requestParams.model });
      }

      if (isModelFailure && attempt < maxAttempts) {
        const nextModel = getNextModel(requestParams.model, fallbackModel, triedModels);
        if (nextModel) {
          log.warn(`Modelo ${requestParams.model} falló (${msg.slice(0, 80)}); cambiando a: ${nextModel}`);
          triedModels.add(nextModel);
          requestParams.model = nextModel;
          // Si el nuevo modelo es 3.x y tenía activado googleSearch (que en free tier solo tiene cuota en 2.5), lo removemos para evitar 429
          if (!nextModel.startsWith("gemini-2.5") && requestParams.config?.tools) {
            const { tools, ...restConfig } = requestParams.config;
            requestParams.config = restConfig;
          }
          continue;
        }
      }

      const canRetry = attempt < maxAttempts && isRetriableAIError(err);
      if (!canRetry) break;

      log.warn("Error transitorio en IA; reintentando", {
        attempt,
        model: requestParams.model,
        err: msg.slice(0, 120),
      });
      await wait(Math.min(800 * attempt, 2000));
    }
  }

  const finalErr = lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Error desconocido de IA"));
  finalErr.message = `AI generation failed: ${finalErr.message}`;
  throw finalErr;
}

/**
 * Convierte el historial al formato de Gemini garantizando que:
 * 1. Siempre empiece con role "user"
 * 2. Nunca existan dos turnos consecutivos del mismo rol (evita errores 400/500 en replies)
 */
function toGeminiHistory(history) {
  if (!Array.isArray(history)) return [];

  const valid = history.filter(
    (m) => m && typeof m.content === "string" && m.content.trim() && (m.role === "assistant" || m.role === "user")
  );

  const merged = [];
  for (const m of valid) {
    const geminiRole = m.role === "assistant" ? "model" : "user";
    const text = m.content.trim();
    if (merged.length > 0 && merged[merged.length - 1].role === geminiRole) {
      merged[merged.length - 1].parts[0].text += `\n\n${text}`;
    } else {
      merged.push({ role: geminiRole, parts: [{ text }] });
    }
  }

  // Si empieza con "model" (ej. cuando se reconstruye desde un reply antiguo), insertamos un turno "user" inicial
  if (merged.length > 0 && merged[0].role === "model") {
    merged.unshift({
      role: "user",
      parts: [{ text: "(Contexto previo de nuestra conversación)" }],
    });
  }

  return merged;
}

/** Obtiene anclaje temporal exacto y obligatorio. */
function getTemporalPrompt() {
  const now = new Date();
  const tz = "America/Mexico_City";
  const fmt = { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz };
  const timeFmt = { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz };

  const hoy = now.toLocaleDateString("es-ES", fmt);
  const hora = now.toLocaleTimeString("es-ES", timeFmt);
  const ayer = new Date(now.getTime() - 86_400_000).toLocaleDateString("es-ES", fmt);
  const anteayer = new Date(now.getTime() - 2 * 86_400_000).toLocaleDateString("es-ES", fmt);
  const manana = new Date(now.getTime() + 86_400_000).toLocaleDateString("es-ES", fmt);
  const anio = now.getFullYear();

  return `\n\n[REGLA TEMPORAL OBLIGATORIA - TIEMPO REAL DEL SISTEMA]:
- Fecha actual (HOY): ${hoy} (Hora aproximada: ${hora}).
- Fecha de AYER: ${ayer}.
- Fecha de ANTEAYER: ${anteayer}.
- Fecha de MAÑANA: ${manana}.
- Año actual: ${anio}.
PROHIBIDO decir que estamos en mayo de 2024 o mencionar tu fecha de corte de entrenamiento. Para ti el presente absoluto es ${hoy}.`;
}

/** Limpia saludos y muletillas para armar una query de búsqueda efectiva. */
function extractSearchQuery(text) {
  if (!text || typeof text !== "string") return null;
  const cleaned = text
    .replace(/<@!?\d+>/g, "")
    .replace(/^(hola|buenas|hey|oye|ey|bot|redbot|dime|sabes|por favor|me dices|cuentame|cuéntame|busca|buscar|que sabes de|qué sabes de|que paso con|qué pasó con)[\s,:.!¡¿?]+/gi, "")
    .replace(/[¿?¡!]/g, "")
    .trim();

  return cleaned.length >= 2 ? cleaned : text.trim();
}

/** Determina si la consulta necesita información externa o en tiempo real. */
function shouldSearchWeb(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.toLowerCase().trim();
  if (t.length < 4) return false;

  // Saludos puros o charla mínima
  if (/^(hola+|buenas+|hey|que tal|qué tal|como estas|cómo estás|quien eres|quién eres|gracias|chau|adios|adiós|jaja+|xd+|ok|dale|bueno|bien|mal)[\s!.,?]*$/i.test(t)) {
    return false;
  }

  // Preguntas puramente de qué fecha/día es hoy/ayer/mañana ya se responden con getTemporalPrompt()
  if (/^(hola\s+)?(que|qué|cual|cuál)\s+(dia|día|fecha|hora|año)\s+(es|era|fue|será|sera|estamos)\s*(hoy|ayer|mañana|manana|anteayer|ahora)?[\s?]*$/i.test(t)) {
    return false;
  }

  return true;
}

/**
 * Busca información real en vivo combinando Google News RSS y Wikipedia API
 * (No sufren bloqueos de CAPTCHA en IPs de datacenters como DuckDuckGo HTML).
 */
async function performWebSearch(query) {
  if (!query || typeof query !== "string") return [];
  const cleanQ = query.slice(0, 120);
  const snippets = [];

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQ)}&hl=es-419&gl=MX&ceid=MX:es-419`;
    const wpUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&utf8=&format=json&srlimit=3`;

    const [rssRes, wpRes] = await Promise.allSettled([
      withAITimeout(fetch(rssUrl, { headers: { "User-Agent": "Mozilla/5.0" } }), 3500),
      withAITimeout(fetch(wpUrl, { headers: { "User-Agent": "RedBot/1.0" } }), 3500),
    ]);

    if (rssRes.status === "fulfilled" && rssRes.value.ok) {
      const xml = await rssRes.value.text();
      const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) && snippets.length < 4) {
        const title = match[1].replace(/<!\[CDATA\[\vert{}\]\]>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
        const pubDate = match[2].trim();
        if (title) snippets.push(`[Noticia - ${pubDate}]: ${title}`);
      }
    }

    if (wpRes.status === "fulfilled" && wpRes.value.ok) {
      const data = await wpRes.value.json();
      const searchResults = data?.query?.search ?? [];
      for (const item of searchResults.slice(0, 2)) {
        const cleanSnippet = (item.snippet || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').trim();
        if (cleanSnippet) {
          snippets.push(`[Wikipedia - ${item.title}]: ${cleanSnippet}`);
        }
      }
    }
  } catch {
    // Ignorar errores de red de búsqueda para no interrumpir la respuesta
  }

  return snippets;
}

/** Respuesta de chat con System Instruction real + anclaje temporal + Google Search Grounding / Web Search. */
async function generateChatReply(historial) {
  const normalizedHistory = toGeminiHistory(historial);
  const lastUserMsg = Array.isArray(historial)
    ? [...historial].reverse().find((m) => m && m.role === "user")?.content ?? ""
    : "";

  const temporalBlock = getTemporalPrompt();
  let systemInstruction = SYSTEM_PROMPT + temporalBlock;

  const needsSearch = shouldSearchWeb(lastUserMsg);
  if (needsSearch) {
    const searchQuery = extractSearchQuery(lastUserMsg) || lastUserMsg;
    const webSnippets = await performWebSearch(searchQuery);
    if (webSnippets.length > 0) {
      systemInstruction += `\n\n[Resultados de búsqueda web en tiempo real para "${searchQuery}"]:\n${webSnippets.join("\n")}\nUsa esta información actualizada para responder con precisión.`;
    }
  }

  // Reforzamos la fecha actual de forma invisible en el último mensaje del usuario si pregunta por fechas/tiempo
  if (normalizedHistory.length > 0) {
    const lastTurn = normalizedHistory[normalizedHistory.length - 1];
    if (lastTurn.role === "user") {
      lastTurn.parts[0].text = `${temporalBlock.trim()}\n\nMensaje del usuario: ${lastTurn.parts[0].text}`;
    }
  }

  // Si el modelo es de la familia Gemini 2.5 (que tiene 1,500 RPD gratuitos de Google Search Grounding), lo habilitamos
  const useNativeGoogleSearch = needsSearch && AI_MODEL_CHAT.startsWith("gemini-2.5");

  const response = await generateWithFallback(
    {
      model: AI_MODEL_CHAT,
      contents: normalizedHistory,
      config: {
        systemInstruction,
        temperature: 0.9,
        ...(useNativeGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
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

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function fetchImageAsInlineData(url, timeoutMs = 10_000) {
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error("La imagen supera el tamaño máximo permitido");

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error("La imagen supera el tamaño máximo permitido");

  return {
    inlineData: {
      mimeType: (res.headers.get("content-type") || "image/png").split(";")[0].trim(),
      data: Buffer.from(buf).toString("base64"),
    },
  };
}

async function generateText(prompt, systemInstruction = undefined) {
  const response = await generateWithFallback(
    {
      model: AI_MODEL_FAST,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.9,
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    },
    { fallbackModel: AI_MODEL_FAST_FALLBACK }
  );
  return response.text?.trim() || null;
}

async function generateVision(prompt, imageUrl) {
  const imagePart = await fetchImageAsInlineData(imageUrl);
  const response = await generateWithFallback(
    {
      model: AI_MODEL_VISION,
      contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
      config: { temperature: 1.0 },
    },
    { fallbackModel: AI_MODEL_VISION_FALLBACK }
  );
  return response.text?.trim() || null;
}

module.exports = {
  getAI,
  generateWithFallback,
  generateChatReply,
  generateText,
  generateVision,
  fetchImageAsInlineData,
  toGeminiHistory,
  setConversacion,
  getConversacion,
  deleteConversacion,
};
