const dns = require("node:dns");
const dnsPromises = dns.promises;
const net = require("node:net");

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback", "metadata.google.internal"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp"];
const MAX_REDIRECTS = 5;
const SENSITIVE_REDIRECT_HEADERS = new Set(["authorization", "cookie", "proxy-authorization"]);

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function parseIPv6Hextets(rawIp) {
  const clean = String(rawIp || "").split("%")[0].toLowerCase();
  if (!clean) return null;

  let normalized = clean;
  const lastColon = normalized.lastIndexOf(":");
  if (lastColon !== -1 && normalized.slice(lastColon + 1).includes(".")) {
    const ipv4Part = normalized.slice(lastColon + 1);
    const octets = ipv4Part.split(".").map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const dblSplit = normalized.split("::");
  if (dblSplit.length > 2) return null;

  let groups;
  if (dblSplit.length === 2) {
    const left = dblSplit[0] ? dblSplit[0].split(":") : [];
    const right = dblSplit[1] ? dblSplit[1].split(":") : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return null;
    groups = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    groups = normalized.split(":");
    if (groups.length !== 8) return null;
  }

  const hextets = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    hextets.push(Number.parseInt(g, 16));
  }
  return hextets;
}

function hextetsToIPv4(hi, lo) {
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

function isPrivateIPv6(ip) {
  const h = parseIPv6Hextets(ip);
  if (!h) return true;

  // :: (unspecified) and ::1 (loopback)
  const firstSixZero = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0;
  if (firstSixZero && h[6] === 0 && (h[7] === 0 || h[7] === 1)) return true;

  // IPv4-compatible ::/96 (e.g. ::127.0.0.1)
  if (firstSixZero) return isPrivateIPv4(hextetsToIPv4(h[6], h[7]));

  // IPv4-mapped ::ffff:0:0/96
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) {
    return isPrivateIPv4(hextetsToIPv4(h[6], h[7]));
  }

  // IPv4-translated SIIT ::ffff:0:0:0/96
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0xffff && h[5] === 0) {
    return isPrivateIPv4(hextetsToIPv4(h[6], h[7]));
  }

  // NAT64 well-known 64:ff9b::/96 & local-use 64:ff9b:1::/48
  if (h[0] === 0x0064 && h[1] === 0xff9b) {
    if (h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
      return isPrivateIPv4(hextetsToIPv4(h[6], h[7]));
    }
    if (h[2] === 1) return true;
  }

  // Discard 100::/64
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true;

  // 6to4 2002::/16 (embeds IPv4 in h[1], h[2])
  if (h[0] === 0x2002) {
    return isPrivateIPv4(hextetsToIPv4(h[1], h[2]));
  }

  // Teredo 2001:0000::/32
  if (h[0] === 0x2001 && h[1] === 0x0000) return true;

  // ULA fc00::/7
  if ((h[0] & 0xfe00) === 0xfc00) return true;

  // Link-local fe80::/10
  if ((h[0] & 0xffc0) === 0xfe80) return true;

  // Multicast ff00::/8
  if ((h[0] & 0xff00) === 0xff00) return true;

  return false;
}

function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true;
}

let publicAgent = null;
try {
  const { Agent } = require("undici");
  publicAgent = new Agent({
    connect: {
      lookup(hostname, opts, cb) {
        const cleanHost = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
        if (BLOCKED_HOSTNAMES.has(cleanHost) || BLOCKED_SUFFIXES.some((s) => cleanHost.endsWith(s))) {
          return cb(new Error("Host no permitido"));
        }
        dns.lookup(hostname, opts, (err, address, family) => {
          if (err) return cb(err);
          if (Array.isArray(address)) {
            if (!address.length || address.some((r) => isPrivateAddress(r.address))) {
              return cb(new Error("Host no permitido"));
            }
            return cb(null, address);
          }
          if (!address || isPrivateAddress(address)) {
            return cb(new Error("Host no permitido"));
          }
          return cb(null, address, family);
        });
      },
    },
  });
} catch (err) {
  console.warn("[SECURITY] undici no disponible; proteccion anti-DNS-rebinding desactivada:", err?.message ?? String(err));
}

async function closePublicAgent() {
  if (!publicAgent) return;
  try {
    await publicAgent.close();
  } catch {}
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeRedirectHeaders(rawHeaders) {
  if (!rawHeaders) return undefined;
  const cleaned = {};
  if (rawHeaders instanceof Headers || typeof rawHeaders.forEach === "function") {
    rawHeaders.forEach((val, key) => {
      if (!SENSITIVE_REDIRECT_HEADERS.has(String(key).toLowerCase())) {
        cleaned[key] = val;
      }
    });
    return cleaned;
  }
  for (const [key, val] of Object.entries(rawHeaders)) {
    if (!SENSITIVE_REDIRECT_HEADERS.has(String(key).toLowerCase())) {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

/**
 * Valida que una URL provista por un usuario apunte a un host publico.
 * Resuelve DNS y rechaza cualquier direccion privada, loopback o link-local.
 */
async function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL invalida");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Protocolo no permitido");
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new Error("URL invalida");
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error("Host no permitido");
  }

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Host no permitido");
    return parsed;
  }

  const records = await dnsPromises.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((r) => isPrivateAddress(r.address))) {
    throw new Error("Host no permitido");
  }
  return parsed;
}

/**
 * fetch con validacion de host publico en cada salto de redireccion.
 * Misma firma que fetchWithTimeout: (url, options, timeoutMs).
 */
async function fetchPublic(url, options = {}, timeoutMs = 10_000) {
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);
  let current = url;
  let reqOpts = { ...options };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const prevParsed = await assertPublicUrl(current);
    const fetchOpts = { ...reqOpts, redirect: "manual", signal };
    if (publicAgent && !fetchOpts.dispatcher) {
      fetchOpts.dispatcher = publicAgent;
    }
    const res = await fetch(current, fetchOpts);

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel?.().catch(() => {});
      const nextParsed = new URL(location, current);
      if (nextParsed.origin !== prevParsed.origin && reqOpts.headers) {
        reqOpts = { ...reqOpts, headers: sanitizeRedirectHeaders(reqOpts.headers) };
      }
      const method = String(reqOpts.method || "GET").toUpperCase();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        const nextOpts = { ...reqOpts, method: "GET" };
        delete nextOpts.body;
        reqOpts = nextOpts;
      }
      current = nextParsed.toString();
      continue;
    }

    return res;
  }

  throw new Error("Demasiadas redirecciones");
}

// Lee el cuerpo por streaming y corta apenas supera maxBytes para evitar descargas sin cota
async function readBodyLimited(res, maxBytes) {
  const declared = Number(res.headers?.get?.("content-length") ?? 0);
  if (declared > maxBytes) {
    await res.body?.cancel?.().catch(() => {});
    return { tooLarge: true, size: declared, buffer: null };
  }

  if (!res.body?.getReader) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > maxBytes
      ? { tooLarge: true, size: buf.length, buffer: null }
      : { tooLarge: false, size: buf.length, buffer: buf };
  }

  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true, size, buffer: null };
      }
      chunks.push(Buffer.from(value));
    }
    return { tooLarge: false, size, buffer: Buffer.concat(chunks) };
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

async function readTextLimited(res, maxBytes = 2 * 1024 * 1024) {
  const body = await readBodyLimited(res, maxBytes);
  if (body.tooLarge || !body.buffer) {
    throw new Error("Respuesta HTML/texto demasiado grande");
  }
  return body.buffer.toString("utf8");
}

module.exports = {
  assertPublicUrl,
  fetchPublic,
  readBodyLimited,
  readTextLimited,
  closePublicAgent,
  escapeHtml,
};
