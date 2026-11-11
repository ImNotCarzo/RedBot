const dns = require("node:dns").promises;
const net = require("node:net");

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback", "metadata.google.internal"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp"];
const MAX_REDIRECTS = 5;

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

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;

  const mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isPrivateIPv4(mappedDotted[1]);

  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  if (/^f[cd]/.test(lower)) return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (lower.startsWith("ff")) return true;
  return false;
}

function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true;
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

  const records = await dns.lookup(host, { all: true, verbatim: true });
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

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...options, redirect: "manual", signal });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel?.().catch(() => {});
      current = new URL(location, current).toString();
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
}

module.exports = { assertPublicUrl, fetchPublic, isPrivateAddress, readBodyLimited };
