/**
 * Normalise a reply payload so it always has the `content` key expected by
 * Discord.js' `message.reply()`.
 *
 * @param {string|string[]|object} payload
 * @returns {object}
 */
function normalizeReplyPayload(payload) {
  if (typeof payload === "string")  return { content: payload };
  if (Array.isArray(payload))       return { content: payload.join("\n") };
  if (!payload || typeof payload !== "object") return { content: String(payload ?? "") };
  return payload;
}

module.exports = { normalizeReplyPayload };
