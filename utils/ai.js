const { GoogleGenAI } = require("@google/genai");

const GEMINI_KEYS = [process.env.GEMINI, process.env.GEMINI2].filter(Boolean);
let currentKey = 0;
const aiClients = new Map();

function getAI() {
  const apiKey = GEMINI_KEYS[currentKey];
  if (!aiClients.has(apiKey)) {
    aiClients.set(apiKey, new GoogleGenAI({ apiKey }));
  }
  return aiClients.get(apiKey);
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

module.exports = { generateWithFallback, needsSearchAI, toGeminiHistory, getAI };
