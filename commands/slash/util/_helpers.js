const { generateWithFallback, getAI } = require("../../../src/ai");
const { fetchWithTimeout } = require("../../_shared/runtime");

async function generateGemma(messages) {
  try {
    const msg = messages?.[0];
    if (!msg) return null;

    let text = "";
    let imageUrl = null;
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") text += part.text;
        if (part.type === "image_url") imageUrl = part.image_url?.url ?? null;
      }
    } else {
      text = msg.content;
    }

    if (!text && !imageUrl) throw new Error("Request requires either text or an image");
    const parts = [{ text: text || "Describe la imagen." }];
    if (imageUrl) {
      const res = await fetchWithTimeout(imageUrl, {}, 10_000);
      if (!res.ok) {
        throw new Error(`No se pudo descargar la imagen (${res.status})`);
      }
      const buf = await res.arrayBuffer();

      parts.push({
        inlineData: {
          mimeType: res.headers.get("content-type") || "image/png",
          data: Buffer.from(buf).toString("base64"),
        },
      });
    }

    const response = await getAI().models.generateContent({
      model: "gemma-4-31b-it",
      contents: [{ role: "user", parts }],
      config: { temperature: 1.0 },
    });

    return response.text?.trim() ?? null;
  } catch (err) {
    const msg = err?.message || "AI provider request failed";
    throw new Error(msg);
  }
}

async function generateGeminiText(prompt) {
  const response = await generateWithFallback({
    model: "gemini-3.1-flash-lite-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text?.trim() ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendWithRetry(miembro, payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await miembro.send(payload);
      return true;
    } catch (err) {
      if (err?.status === 429) {
        const wait = (err?.rawError?.retry_after ?? 2) * 1000;
        await sleep(wait);
        continue;
      }
      return false;
    }
  }
  return false;
}

module.exports = {
  generateGemma,
  generateGeminiText,
  sleep,
  sendWithRetry,
};
