const { generateWithFallback } = require("../../src/ai");
const {
  AI_MODEL_FAST,
  AI_MODEL_FAST_FALLBACK,
  AI_MODEL_VISION,
  AI_MODEL_VISION_FALLBACK,
} = require("../../src/config");
const { fetchImageAsInlineData } = require("./runtime");

/** Texto simple de respuesta rápida (resúmenes, diversión: opinion, critica, excusa, teoria). */
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

/** Prompt + imagen (visión multimodal de alta resolución usando Gemini 3.1 Flash Lite). */
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

module.exports = { generateText, generateVision };
