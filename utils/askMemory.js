const { MAX_HISTORIAL } = require("../src/config/constants");
const conversaciones = new Map();

function setConversacion(userId, historial, lastBotMessageId) {
  const prev = conversaciones.get(userId);
  if (prev?.timeout) clearTimeout(prev.timeout);
  const timeout = setTimeout(() => conversaciones.delete(userId), 10 * 60 * 1000);
  conversaciones.set(userId, { historial, lastBotMessageId, timeout });
}

function getConversacion(userId) {
  return conversaciones.get(userId) ?? null;
}

function deleteConversacion(userId) {
  const data = conversaciones.get(userId);
  if (data?.timeout) clearTimeout(data.timeout);
  conversaciones.delete(userId);
}

module.exports = { MAX_HISTORIAL, setConversacion, getConversacion, deleteConversacion };
