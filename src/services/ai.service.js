const { GoogleGenAI } = require("@google/genai");
const Logger = require("../core/logger");

const log = new Logger("AI_SERVICE", process.env.LOG_LEVEL);

const GEMINI_KEYS = [process.env.GEMINI, process.env.GEMINI2].filter(Boolean);
const aiClients = new Map();
let currentKey = 0;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  return msg.includes("timeout") || msg.includes("timed out") || msg.includes("econnreset");
}

async function withTimeout(promise, timeoutMs) {
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

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(getAI().models.generateContent(params), timeoutMs);
    } catch (err) {
      lastErr = err;
      const status = Number(err?.status ?? err?.code ?? 0);
      const canRotate = status === 429 && GEMINI_KEYS.length > 1;
      const canRetry = attempt < maxAttempts && (canRotate || isRetriableAIError(err));

      if (!canRetry) break;

      if (canRotate) {
        rotateKey();
        log.warn("Rate limit en Gemini; rotando API key", { attempt });
      } else {
        log.warn("Error transitorio en IA; reintentando", { attempt, err: err?.message ?? String(err) });
      }

      const backoff = Math.min(1500 * (2 ** (attempt - 1)), 6000);
      await sleep(backoff);
    }
  }

  const finalErr = lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Error desconocido de IA"));
  finalErr.message = `AI generation failed: ${finalErr.message}`;
  throw finalErr;
}

async function needsSearchAI(question) {
  if (!question || typeof question !== "string") return false;
  try {
    const res = await generateWithFallback({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{
        role: "user",
        parts: [{
          text: `Answer only YES or NO. Does this question require current or real-time information from the internet (news, weather, sports results, prices, events, updates)?\nQuestion: ${question}`,
        }],
      }],
    }, { timeoutMs: 10_000, maxAttempts: 2 });

    return res.text?.trim()?.toLowerCase().includes("yes") ?? false;
  } catch (err) {
    log.warn("No se pudo determinar si la consulta requiere búsqueda", { err: err?.message ?? String(err) });
    return false;
  }
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

module.exports = { generateWithFallback, needsSearchAI, toGeminiHistory, getAI };
