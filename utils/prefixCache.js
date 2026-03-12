const MAX_SIZE = 1000;
const cache = new Map();

const prefixCache = {
  has(key)       { return cache.has(key); },
  get(key)       { return cache.get(key); },
  set(key, val)  {
    if (cache.size >= MAX_SIZE && !cache.has(key)) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
    cache.set(key, val);
  },
  delete(key)    { return cache.delete(key); },
};

module.exports = prefixCache;