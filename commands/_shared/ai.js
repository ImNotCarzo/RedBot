const { generateWithFallback } = require("../../src/ai");
const { AI_MODEL_FAST, AI_MODEL_VISION } = require("../../src/config");
const { fetchImageAsInlineData } = require("./runtime");

/** Texto simple de respuesta rápida (resúmenes, diversión). */
async function generateText(prompt) {
  const response = await generateWithFallback({
    model: AI_MODEL_FAST,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text?.trim() || null;
}

/** Prompt + imagen (visión multimodal de alta resolución). */
async function generateVision(prompt, imageUrl) {
  const imagePart = await fetchImageAsInlineData(imageUrl);
  const response = await generateWithFallback({
    model: AI_MODEL_VISION,
    contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
    config: { temperature: 1.0 },
  });
  return response.text?.trim() || null;
}

module.exports = { generateText, generateVision };
