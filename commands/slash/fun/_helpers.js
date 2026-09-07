const { generateWithFallback } = require("../../../src/ai");
const { fetchWithTimeout } = require("../../_shared/runtime");

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

async function generateGemma(prompt) {
  const response = await generateWithFallback({
    model: "gemma-4-26b-a4b-it",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 1.0,
    },
  });
  return response.text?.trim() ?? null;
}

async function generateGemmaVision(prompt, imageUrl) {
  const imgRes = await fetchWithTimeout(imageUrl, {}, 10_000);
  if (!imgRes.ok) throw new Error(`No se pudo descargar imagen (${imgRes.status})`);
  const imgBuf = await imgRes.arrayBuffer();
  const imgBase64 = Buffer.from(imgBuf).toString("base64");
  const mimeType = imgRes.headers.get("content-type") ?? "image/png";

  const response = await generateWithFallback({
    model: "gemma-4-26b-a4b-it",
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imgBase64 } },
      ],
    }],
    config: {
      temperature: 1.2,
    },
  });
  return response.text?.trim() ?? null;
}

async function generateGeminiFlash(prompt) {
  const response = await generateWithFallback({
    model: "gemini-3.1-flash-lite",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text?.trim() ?? null;
}

function msATexto(ms) {
  const min = Math.floor(ms / 60000);
  const hrs = Math.floor(min / 60);
  const dias = Math.floor(hrs / 24);
  const mes = Math.floor(dias / 30);
  const años = Math.floor(dias / 365);
  if (años >= 1) return `${años} año${años > 1 ? "s" : ""}`;
  if (mes >= 1) return `${mes} mes${mes > 1 ? "es" : ""}`;
  if (dias >= 1) return `${dias} día${dias > 1 ? "s" : ""}`;
  if (hrs >= 1) return `${hrs} hora${hrs > 1 ? "s" : ""}`;
  return `${min} minuto${min > 1 ? "s" : ""}`;
}

module.exports = {
  PERSONA,
  generateGemma,
  generateGemmaVision,
  generateGeminiFlash,
  msATexto,
};
