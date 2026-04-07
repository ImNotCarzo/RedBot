const { MAX_HISTORIAL } = require("../config/constants");

const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 2000;
const sessions = new Map();

function assertUserId(userId) {
  if (!userId || typeof userId !== "string") throw new TypeError("userId inválido");
}

function clearSessionTimeout(session) {
  if (session?.timeout) clearTimeout(session.timeout);
}

function evictIfNeeded() {
  while (sessions.size >= MAX_SESSIONS) {
    const oldestKey = sessions.keys().next().value;
    if (!oldestKey) break;
    const oldest = sessions.get(oldestKey);
    clearSessionTimeout(oldest);
    sessions.delete(oldestKey);
  }
}

function setConversacion(userId, historial, lastBotMessageId) {
  assertUserId(userId);

  const current = sessions.get(userId);
  if (current) clearSessionTimeout(current);

  evictIfNeeded();

  const timeout = setTimeout(() => {
    const session = sessions.get(userId);
    if (session) clearSessionTimeout(session);
    sessions.delete(userId);
  }, SESSION_TTL_MS);
  timeout.unref();

  const normalizedHistory = Array.isArray(historial) ? historial.slice(-MAX_HISTORIAL) : [];
  sessions.set(userId, {
    historial: normalizedHistory,
    lastBotMessageId: lastBotMessageId ?? null,
    updatedAt: Date.now(),
    timeout,
  });
}

function getConversacion(userId) {
  assertUserId(userId);
  const session = sessions.get(userId);
  if (!session) return null;

  sessions.delete(userId);
  sessions.set(userId, session);
  return session;
}

function deleteConversacion(userId) {
  assertUserId(userId);
  const session = sessions.get(userId);
  if (session) clearSessionTimeout(session);
  sessions.delete(userId);
}

module.exports = { MAX_HISTORIAL, setConversacion, getConversacion, deleteConversacion };
