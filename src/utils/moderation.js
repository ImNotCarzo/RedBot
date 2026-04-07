const crypto = require("node:crypto");

function generateId(length = 6) {
  const size = Number.isFinite(length) ? Math.max(4, Math.min(12, Math.floor(length))) : 6;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < size; i += 1) {
    id += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return id;
}

function parseDuration(raw) {
  if (typeof raw !== "string") return null;
  const str = raw.trim().toLowerCase();
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[match[2]];
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

module.exports = { generateId, parseDuration, formatDuration };
