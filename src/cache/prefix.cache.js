const MAX_SIZE = 2000;
const TTL_MS = 30 * 60 * 1000;

const cache = new Map();

function now() {
  return Date.now();
}

function isExpired(entry) {
  return !entry || entry.expiresAt <= now();
}

function pruneExpired() {
  for (const [key, entry] of cache.entries()) {
    if (!isExpired(entry)) continue;
    cache.delete(key);
  }
}

function evictIfNeeded() {
  pruneExpired();
  while (cache.size >= MAX_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function get(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (isExpired(entry)) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function has(key) {
  return get(key) !== undefined;
}

function set(key, value) {
  evictIfNeeded();
  cache.set(key, { value, expiresAt: now() + TTL_MS });
}

function del(key) {
  return cache.delete(key);
}

function clear() {
  cache.clear();
}

module.exports = { has, get, set, delete: del, clear, pruneExpired };
