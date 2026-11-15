const { GoogleGenAI } = require("@google/genai");
const { MAX_HISTORIAL, SYSTEM_PROMPT } = require("./config");
const { AiSession } = require("./database");
const { normalizeLang } = require("./i18n");
const { Logger, wait, fetchWithTimeout } = require("./runtime");
const { fetchPublic, readBodyLimited } = require("./security");

const log = new Logger("AI_SERVICE");
const GEMINI_KEYS = [process.env.GEMINI, process.env.GEMINI2].filter(Boolean);
const aiClients = new Map();
let currentKey = 0;

const FALLBACK_CHAIN = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemma-4-31b-it",
  "gemma-4-26b-a4b-it",
];

const DEFAULT_TIMEOUT_MS = 12_000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 2000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const sessions = new Map();

function getAI() {
  const apiKey = GEMINI_KEYS[currentKey] ?? null;
  if (!apiKey) throw new Error("No hay ninguna clave API de Gemini configurada");
  if (!aiClients.has(apiKey)) {
    aiClients.set(apiKey, new GoogleGenAI({ apiKey }));
  }
  return aiClients.get(apiKey);
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

async function generateWithFallback(params, customChain = null) {
  const chain = Array.isArray(customChain) && customChain.length > 0 ? customChain : FALLBACK_CHAIN;
  const maxAttempts = Math.max(chain.length, 2);
  const triedModels = new Set([params.model]);
  const { timeoutMs: _timeoutIgnored, ...baseParams } = params;
  const requestParams = { ...baseParams, config: { ...params.config } };
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
        currentKey = (currentKey + 1) % GEMINI_KEYS.length;
        log.warn("Rate limit en Gemini; rotando API key", { attempt, model: requestParams.model });
      }

      if (isModelFailure && attempt < maxAttempts) {
        const nextModel = chain.find((m) => !triedModels.has(m));
        if (nextModel) {
          log.warn(`Modelo ${requestParams.model} falló (${msg.slice(0, 80)}); cambiando a: ${nextModel}`);
          triedModels.add(nextModel);
          requestParams.model = nextModel;

          if (nextModel.startsWith("gemma")) {
            if (requestParams.config?.tools) {
              delete requestParams.config.tools;
            }
            if (requestParams.config?.systemInstruction) {
              const sysInst = requestParams.config.systemInstruction;
              delete requestParams.config.systemInstruction;
              if (Array.isArray(requestParams.contents) && requestParams.contents.length > 0) {
                const userTurn = requestParams.contents.find((c) => c.role === "user") || requestParams.contents[0];
                if (userTurn?.parts) {
                  const textPart = userTurn.parts.find((p) => typeof p.text === "string");
                  if (textPart) {
                    textPart.text = `[Instrucciones]: ${sysInst}\n\n${textPart.text}`;
                  } else {
                    userTurn.parts.unshift({ text: `[Instrucciones]: ${sysInst}` });
                  }
                }
              }
            }
          }
          continue;
        }
      }

      if (status === 400 && requestParams.config?.tools && attempt < maxAttempts) {
        delete requestParams.config.tools;
        log.warn("Herramienta googleSearch rechazada con 400; reintentando sin tool", { model: requestParams.model });
        continue;
      }

      if (attempt >= maxAttempts || !isRetriableAIError(err)) break;

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

// Garantiza inicio con role "user" y sin turnos consecutivos del mismo rol
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

  if (merged.length > 0 && merged[0].role === "model") {
    merged.unshift({
      role: "user",
      parts: [{ text: "(Contexto previo de nuestra conversación)" }],
    });
  }

  return merged;
}

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

function extractSearchQuery(text) {
  if (!text || typeof text !== "string") return null;
  const cleaned = text
    .replace(/<@!?\d+>/g, "")
    .replace(/^(hola|buenas|hey|oye|ey|bot|redbot|dime|sabes|por favor|me dices|cuentame|cuéntame|busca|buscar|que sabes de|qué sabes de|que paso con|qué pasó con)[\s,:.!¡¿?]+/gi, "")
    .replace(/[¿?¡!]/g, "")
    .trim();

  return cleaned.length >= 2 ? cleaned : text.trim();
}

function shouldSearchWeb(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.toLowerCase().trim();
  if (t.length < 4) return false;

  if (/^(hola+|buenas+|hey|que tal|qué tal|como estas|cómo estás|quien eres|quién eres|gracias|chau|adios|adiós|jaja+|xd+|ok|dale|bueno|bien|mal)[\s!.,?]*$/i.test(t)) {
    return false;
  }

  if (/^(hola\s+)?(que|qué|cual|cuál)\s+(dia|día|fecha|hora|año)\s+(es|era|fue|será|sera|estamos)\s*(hoy|ayer|mañana|manana|anteayer|ahora)?[\s?]*$/i.test(t)) {
    return false;
  }

  // Solo busca en la web cuando el mensaje pide informacion actual o factual, no en cada charla
  return /(noticia|actual|último|ultimo|reciente|precio|cotizaci|clima|resultado|quién es|quien es|qué pasó|que paso|cuándo|cuando sale|estreno|lanzamiento|202\d|presidente|campe[óo]n|sale el|salió|salio)/i.test(t);
}

async function performWebSearch(query) {
  if (!query || typeof query !== "string") return [];
  const cleanQ = query.slice(0, 120);
  const snippets = [];

  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQ)}&hl=es-419&gl=MX&ceid=MX:es-419`;
    const wpUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&utf8=&format=json&srlimit=3`;

    const [rssRes, wpRes] = await Promise.allSettled([
      fetchWithTimeout(rssUrl, { headers: { "User-Agent": "Mozilla/5.0" } }, 3500),
      fetchWithTimeout(wpUrl, { headers: { "User-Agent": "RedBot/1.0" } }, 3500),
    ]);

    if (rssRes.status === "fulfilled" && rssRes.value.ok) {
      const xml = await rssRes.value.text();
      const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) && snippets.length < 4) {
        const title = match[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
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
  } catch {}

  return snippets;
}

async function generateChatReply(historial, { lang = "es", imageUrl = null, serverContext = null, useSearch = null } = {}) {
  const resolvedLang = normalizeLang(lang);
  const normalizedHistory = toGeminiHistory(historial);
  const lastUserMsg = Array.isArray(historial)
    ? [...historial].reverse().find((m) => m && m.role === "user")?.content ?? ""
    : "";

  const temporalBlock = getTemporalPrompt();
  let systemInstruction = SYSTEM_PROMPT + temporalBlock;
  if (resolvedLang === "en") {
    systemInstruction += "\n\nLANGUAGE OVERRIDE: This server uses English. Respond ONLY in natural, sarcastic, witty English with zero filler phrases (never say 'Sure!' or 'Of course!'). Keep answers concise and direct.";
  }

  const cleanServerContext = typeof serverContext === "string" ? serverContext.trim() : "";
  if (cleanServerContext) {
    systemInstruction += resolvedLang === "en"
      ? `\n\n[Server context & FAQ]:\n${cleanServerContext.slice(0, 1000)}\nUse this context if relevant to the user's question.`
      : `\n\n[Contexto e info del servidor]:\n${cleanServerContext.slice(0, 1000)}\nUsa este contexto si resulta relevante para la consulta del usuario.`;
  }

  const wantsSearch = useSearch !== null ? Boolean(useSearch) : shouldSearchWeb(lastUserMsg);
  if (wantsSearch) {
    const searchQuery = extractSearchQuery(lastUserMsg) || lastUserMsg;
    const webSnippets = await performWebSearch(searchQuery);
    if (webSnippets.length > 0) {
      systemInstruction += resolvedLang === "en"
        ? `\n\n[Real-time web search results for "${searchQuery}"]:\n${webSnippets.join("\n")}\nUse this up-to-date information to answer accurately.`
        : `\n\n[Resultados de búsqueda web en tiempo real para "${searchQuery}"]:\n${webSnippets.join("\n")}\nUsa esta información actualizada para responder con precisión.`;
    }
  }

  if (normalizedHistory.length > 0) {
    const lastTurn = normalizedHistory[normalizedHistory.length - 1];
    if (lastTurn.role === "user") {
      const msgLabel = resolvedLang === "en" ? "User message" : "Mensaje del usuario";
      lastTurn.parts[0].text = `${temporalBlock.trim()}\n\n${msgLabel}: ${lastTurn.parts[0].text}`;
    }
  }

  if (imageUrl) {
    const imagePart = typeof imageUrl === "string" ? await fetchImageAsInlineData(imageUrl) : imageUrl;
    if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === "user") {
      normalizedHistory[normalizedHistory.length - 1].parts.push(imagePart);
    } else {
      normalizedHistory.push({
        role: "user",
        parts: [{ text: resolvedLang === "en" ? "Analyze this image." : "Analiza esta imagen." }, imagePart],
      });
    }
  }

  const config = {
    systemInstruction,
    temperature: 0.9,
  };
  if (wantsSearch && !FALLBACK_CHAIN[0].startsWith("gemma")) {
    config.tools = [{ googleSearch: {} }];
  }

  const response = await generateWithFallback({
    model: FALLBACK_CHAIN[0],
    contents: normalizedHistory,
    config,
  });

  return response.text?.trim() || (resolvedLang === "en" ? "I couldn't generate a response" : "No pude generar una respuesta");
}

function sessionKey(userId, scope = "global") {
  return `${scope}:${userId}`;
}

function scheduleSessionTimeout(userId, ttlMs = SESSION_TTL_MS) {
  const timeout = setTimeout(() => deleteSessionKey(userId), Math.max(1000, ttlMs));
  timeout.unref();
  return timeout;
}

function evictOldestSessionIfNeeded() {
  while (sessions.size >= MAX_SESSIONS) {
    const oldestKey = sessions.keys().next().value;
    if (!oldestKey) break;
    const oldest = sessions.get(oldestKey);
    if (oldest?.timeout) clearTimeout(oldest.timeout);
    sessions.delete(oldestKey);
  }
}

function setConversacion(rawUserId, historial, lastBotMessageId = null, scope = "global") {
  const userId = sessionKey(rawUserId, scope);
  const current = sessions.get(userId);
  if (current?.timeout) clearTimeout(current.timeout);

  evictOldestSessionIfNeeded();

  const trimmed = Array.isArray(historial) ? historial.slice(-MAX_HISTORIAL) : [];
  const timeout = scheduleSessionTimeout(userId, SESSION_TTL_MS);

  sessions.set(userId, {
    historial: trimmed,
    lastBotMessageId,
    timeout,
  });

  if (AiSession?.db?.readyState === 1) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    AiSession.findOneAndUpdate(
      { sessionKey: userId },
      { $set: { userId: String(rawUserId), scope: String(scope), historial: trimmed, lastBotMessageId, expiresAt } },
      { upsert: true }
    ).catch(() => {});
  }
}

function getConversacion(rawUserId, scope = "global") {
  const userId = sessionKey(rawUserId, scope);
  const session = sessions.get(userId);
  if (!session) return null;
  sessions.delete(userId);
  sessions.set(userId, session);
  return session;
}

function deleteConversacion(rawUserId) {
  for (const key of [...sessions.keys()]) {
    if (key.endsWith(`:${rawUserId}`)) deleteSessionKey(key);
  }
  if (AiSession?.db?.readyState === 1) {
    AiSession.deleteMany({ userId: String(rawUserId) }).catch(() => {});
  }
}

function deleteSessionKey(userId) {
  const session = sessions.get(userId);
  if (session?.timeout) clearTimeout(session.timeout);
  sessions.delete(userId);
  if (AiSession?.db?.readyState === 1) {
    AiSession.deleteOne({ sessionKey: userId }).catch(() => {});
  }
}

async function hydrateAiSessions() {
  if (AiSession?.db?.readyState !== 1) return 0;
  try {
    const now = Date.now();
    const docs = await AiSession.find({ expiresAt: { $gt: new Date(now) } })
      .sort({ updatedAt: -1 })
      .limit(MAX_SESSIONS)
      .lean();

    let count = 0;
    for (const doc of docs.reverse()) {
      if (!doc?.sessionKey || sessions.has(doc.sessionKey)) continue;
      evictOldestSessionIfNeeded();
      const remaining = Math.max(1000, new Date(doc.expiresAt).getTime() - now);
      sessions.set(doc.sessionKey, {
        historial: Array.isArray(doc.historial) ? doc.historial.slice(-MAX_HISTORIAL) : [],
        lastBotMessageId: doc.lastBotMessageId ?? null,
        timeout: scheduleSessionTimeout(doc.sessionKey, remaining),
      });
      count += 1;
    }
    return count;
  } catch (err) {
    log.warn("No se pudieron hidratar sesiones IA", { err: err?.message ?? String(err) });
    return 0;
  }
}

async function fetchImageAsInlineData(url, timeoutMs = 10_000) {
  const res = await fetchPublic(url, {}, timeoutMs);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`);

  const body = await readBodyLimited(res, MAX_IMAGE_BYTES);
  if (body.tooLarge) throw new Error("La imagen supera el tamaño máximo permitido");

  return {
    inlineData: {
      mimeType: (res.headers.get("content-type") || "image/png").split(";")[0].trim(),
      data: body.buffer.toString("base64"),
    },
  };
}

async function generateText(prompt, systemInstruction) {
  const response = await generateWithFallback({
    model: FALLBACK_CHAIN[0],
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.9,
      ...(systemInstruction ? { systemInstruction } : {}),
    },
  });
  return response.text?.trim() || null;
}

async function generateVision(prompt, image) {
  const imagePart = typeof image === "string" ? await fetchImageAsInlineData(image) : image;
  const response = await generateWithFallback({
    model: FALLBACK_CHAIN[0],
    contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
    config: { temperature: 1.0 },
  });
  return response.text?.trim() || null;
}

async function generateTranscription(buffer, mimeType = "video/quicktime") {
  const cleanMime = (mimeType || "video/quicktime").split(";")[0].trim().toLowerCase();
  const prompt = `Transcribe con exactitud, palabra por palabra, todo el audio hablado en este archivo.
Instrucciones estrictas:
- Escribe ÚNICAMENTE el texto que se escucha en el audio.
- Si no hay voz inteligible, no se escucha nada o está en silencio, responde únicamente: NO_AUDIO_DETECTED
- Prohibido agregar introducciones, notas, explicaciones, marcas de tiempo ni formato adicional.`;

  let uploadedFile = null;
  try {
    let filePart;
    if (buffer.length <= 14 * 1024 * 1024) {
      filePart = {
        inlineData: {
          mimeType: cleanMime,
          data: buffer.toString("base64"),
        },
      };
    } else {
      const fileBlob = new Blob([buffer], { type: cleanMime });
      uploadedFile = await getAI().files.upload({
        file: fileBlob,
        config: {
          mimeType: cleanMime,
          displayName: `audio_${Date.now()}`,
        },
      });

      let current = uploadedFile;
      let waited = 0;
      while (current.state === "PROCESSING" && waited < 30_000) {
        await wait(2000);
        waited += 2000;
        current = await getAI().files.get({ name: uploadedFile.name });
      }

      if (current.state === "FAILED") {
        throw new Error("El procesamiento del archivo multimedia falló en Gemini.");
      }

      filePart = {
        fileData: {
          fileUri: current.uri,
          mimeType: current.mimeType || cleanMime,
        },
      };
    }

    const response = await generateWithFallback(
      {
        model: "gemini-3.1-flash-lite",
        contents: [{ role: "user", parts: [{ text: prompt }, filePart] }],
        config: { temperature: 0.2 },
        timeoutMs: 35_000,
      },
      ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]
    );

    const text = response.text?.trim() || "";
    if (!text || text.includes("NO_AUDIO_DETECTED")) return null;
    return text;
  } finally {
    if (uploadedFile?.name) {
      getAI().files.delete({ name: uploadedFile.name }).catch(() => {});
    }
  }
}

async function transcribeMedia(attachment, { maxBytes = 25 * 1024 * 1024 } = {}) {
  const name = attachment?.name ?? "";
  const contentType = attachment?.contentType ?? "";
  const isAudioOrVideo =
    /\.(mp3|mp4|wav|ogg|webm|m4a|flac|mov)$/i.test(name) ||
    contentType.startsWith("audio/") ||
    contentType.startsWith("video/");

  if (!isAudioOrVideo) {
    return { error: "unsupported" };
  }
  if ((attachment?.size ?? 0) > maxBytes) {
    return { error: "too_large" };
  }

  const fileRes = await fetchPublic(attachment.url, {}, 15_000);
  if (!fileRes.ok) throw new Error(`No se pudo descargar archivo (${fileRes.status})`);
  const body = await readBodyLimited(fileRes, maxBytes);
  if (body.tooLarge) {
    return { error: "too_large" };
  }

  const buffer = body.buffer;
  const cleanContentType = (contentType || fileRes.headers.get("content-type") || "audio/ogg").split(";")[0].trim();
  const isMov = /\.mov$/i.test(name) || cleanContentType === "video/quicktime";

  let text = null;
  if (isMov) {
    text = await generateTranscription(buffer, "video/quicktime");
  } else {
    try {
      const { default: Groq } = require("groq-sdk");
      const groq = new Groq({ apiKey: process.env.GROQ });
      const resolvedMime = cleanContentType || "audio/ogg";
      const fallbackName = name || (resolvedMime.includes("ogg") ? "voice-message.ogg" : "audio.mp3");
      const blob = new Blob([buffer], { type: resolvedMime });
      const file = new File([blob], fallbackName, { type: resolvedMime });

      const result = await groq.audio.transcriptions.create({
        file,
        model: "whisper-large-v3",
        response_format: "text",
      });
      text = result?.trim() || null;
    } catch (groqErr) {
      log.warn("[transcribeMedia] Falló Groq Whisper; usando Gemini como fallback", {
        err: groqErr?.message ?? String(groqErr),
      });
      text = await generateTranscription(buffer, cleanContentType || "audio/mpeg");
    }
  }

  return { text };
}

module.exports = {
  generateChatReply,
  generateText,
  generateVision,
  fetchImageAsInlineData,
  generateTranscription,
  transcribeMedia,
  toGeminiHistory,
  setConversacion,
  getConversacion,
  deleteConversacion,
  hydrateAiSessions,
};
