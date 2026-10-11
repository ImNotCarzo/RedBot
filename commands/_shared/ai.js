const { generateWithFallback } = require("../../src/ai");
const { AI_MODEL_DEFAULT, AI_MODEL_SEARCH } = require("../../src/config");
const { fetchImageAsInlineData } = require("./runtime");

/** Texto simple (sin búsqueda). Devuelve null si el modelo no responde. */
async function generateText(prompt) {
  const response = await generateWithFallback({
    model: AI_MODEL_DEFAULT,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text?.trim() || null;
}

/** Prompt + imagen (visión). Devuelve null si el modelo no responde. */
async function generateVision(prompt, imageUrl) {
  const imagePart = await fetchImageAsInlineData(imageUrl);
  const response = await generateWithFallback({
    model: AI_MODEL_SEARCH,
    contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
    config: { temperature: 1.0 },
  });
  return response.text?.trim() || null;
}

module.exports = { generateText, generateVision };
