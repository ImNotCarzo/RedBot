const crypto = require("crypto");
const { escapeHtml } = require("../security");
const { state, rateStore, RATE_WINDOW_MS, RATE_MAX, MAX_RATE_ENTRIES } = require("./context");

function checkRate(ip) {
  const now = Date.now();
  let entry = rateStore.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    if (rateStore.size >= MAX_RATE_ENTRIES && !rateStore.has(ip)) {
      const oldest = rateStore.keys().next().value;
      if (oldest !== undefined) rateStore.delete(oldest);
    }
    entry = { start: now, hits: 0 };
  }
  rateStore.delete(ip);
  rateStore.set(ip, entry);
  entry.hits++;
  return {
    remaining: Math.max(0, RATE_MAX - entry.hits),
    exceeded: entry.hits > RATE_MAX,
  };
}

function json(res, status, data, { noStore = false } = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": (status === 200 && !noStore) ? "public, max-age=15" : "no-store",
  });
  res.end(body);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", state.apiConfig?.API_CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}

function isAuthorized(req) {
  const key = state.apiConfig?.API_KEY;
  if (!key) return true;
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;
  const provided = Buffer.from(token);
  const expected = Buffer.from(key);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function sendHtml(res, status, title, heading, message, extraHeaders = {}) {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141518;color:#f2f3f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
  .card{max-width:460px;width:100%;background:#1e1f24;border:1px solid #ff383d55;border-radius:14px;padding:28px;box-shadow:0 16px 40px #0008;text-align:center}
  .badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#ff383d22;color:#ff5a5e;font-size:12px;font-weight:700;letter-spacing:.4px;margin-bottom:12px}
  h1{margin:0 0 10px;font-size:22px}
  p{margin:0;color:#b5bac1;line-height:1.5;font-size:15px}
</style>
</head>
<body>
  <main class="card">
    <div class="badge">REDBOT</div>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders,
  });
  res.end(html);
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function safeEqualString(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  return bufA.length > 0 && bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    req.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        settled = true;
        const err = new Error("Payload too large");
        err.statusCode = 413;
        req.pause();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (!total) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
      } catch {
        const err = new Error("Invalid JSON body");
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

module.exports = {
  checkRate,
  json,
  setCors,
  isAuthorized,
  sendHtml,
  parseCookies,
  safeEqualString,
  readJsonBody,
};
