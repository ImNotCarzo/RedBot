const http = require("http");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { ChannelType } = require("discord.js");
const { applyOauthGuildLang } = require("./guild");
const { INVITE_URL, Logger } = require("./runtime");
const { version: PACKAGE_VERSION } = require("../package.json");

let server = null;
let botClient = null;
let apiConfig = null;
let log = null;

const rateStore = new Map();
const oauthStates = new Map();
const dashboardSessions = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const MAX_RATE_ENTRIES = 5000;
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const MAX_OAUTH_STATES = 2000;
const DASHBOARD_SESSION_TTL_MS = 24 * 60 * 60_000;
const MAX_DASHBOARD_SESSIONS = 2000;
const PUBLIC_BROWSER_ROUTES = new Set([
  "/invite",
  "/api/invite",
  "/oauth/callback",
  "/api/oauth/callback",
  "/auth/login",
  "/api/auth/login",
  "/auth/logout",
  "/api/auth/logout",
]);
let ratePruneTimer = null;

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
  res.setHeader("Access-Control-Allow-Origin", apiConfig?.API_CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}

function isAuthorized(req) {
  const key = apiConfig?.API_KEY;
  if (!key) return true;
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;
  const provided = Buffer.from(token);
  const expected = Buffer.from(key);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function getOAuthSettings() {
  return {
    clientId: botClient?.user?.id || apiConfig?.CLIENT_ID || process.env.CLIENT_ID || "",
    clientSecret: apiConfig?.CLIENT_SECRET || process.env.CLIENT_SECRET || "",
    redirectUri: apiConfig?.OAUTH_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI || "https://redbot.me/api/oauth/callback",
    successUrl: apiConfig?.OAUTH_SUCCESS_URL || process.env.OAUTH_SUCCESS_URL || "",
    permissions: apiConfig?.INVITE_PERMISSIONS || process.env.INVITE_PERMISSIONS || "8",
  };
}

function handleRoot() {
  return {
    name: "RedBot API",
    version: PACKAGE_VERSION,
    endpoints: [
      { path: "/api/stats", description: "Estadísticas generales del bot" },
      { path: "/api/commands", description: "Catálogo completo de comandos" },
      { path: "/api/bot", description: "Perfil e identidad del bot" },
      { path: "/api/health", description: "Estado de salud del sistema" },
      { path: "/api/invite", description: "Redirección OAuth2 con detección automática de idioma" },
      { path: "/api/oauth/callback", description: "Callback OAuth2 de Discord para detectar idioma inicial o iniciar sesión en el panel" },
      { path: "/api/auth/login", description: "Inicio de sesión OAuth2 para el panel web" },
      { path: "/api/auth/me", description: "Perfil autenticado y servidores administrables del panel" },
      { path: "/api/auth/logout", description: "Cierra la sesión del panel web" },
      { path: "/api/dashboard/guilds", description: "Lista de servidores administrables para el panel web" },
      { path: "/api/tickets/:guildId", description: "Configuración, canales, roles y métricas de tickets" },
      { path: "/api/tickets/:guildId/config", description: "Actualiza configuración y categorías de tickets" },
      { path: "/api/tickets/:guildId/panel", description: "Publica o edita un panel o menú de tickets en Discord" },
    ],
  };
}

function handleStats() {
  const client = botClient;
  if (!client?.readyAt) return { error: "Bot is starting up", ready: false };

  const guilds = client.guilds?.cache;
  const channels = client.channels?.cache;
  const totalUsers = guilds?.reduce((acc, g) => acc + (g.memberCount ?? 0), 0) ?? 0;

  let textChannels = 0;
  let voiceChannels = 0;
  let categoryChannels = 0;
  let forumChannels = 0;
  let stageChannels = 0;

  if (channels) {
    for (const ch of channels.values()) {
      switch (ch.type) {
        case ChannelType.GuildText:
        case ChannelType.GuildAnnouncement:
          textChannels++;
          break;
        case ChannelType.GuildVoice:
          voiceChannels++;
          break;
        case ChannelType.GuildCategory:
          categoryChannels++;
          break;
        case ChannelType.GuildForum:
        case ChannelType.GuildMedia:
          forumChannels++;
          break;
        case ChannelType.GuildStageVoice:
          stageChannels++;
          break;
      }
    }
  }

  let commandInfo = { total: 0, categories: 0 };
  try {
    const { getCommands, CATEGORIES } = require("../commands/slash/help");
    const cmds = getCommands();
    let total = 0;
    for (const cat of Object.values(cmds)) total += Object.keys(cat).length;
    commandInfo = { total, categories: CATEGORIES.length };
  } catch {}

  return {
    guilds: guilds?.size ?? 0,
    users: totalUsers,
    averageUsersPerGuild: guilds?.size ? Math.round(totalUsers / guilds.size) : 0,
    channels: {
      total: channels?.size ?? 0,
      text: textChannels,
      voice: voiceChannels,
      stage: stageChannels,
      forum: forumChannels,
      categories: categoryChannels,
    },
    emojis: guilds?.reduce((acc, g) => acc + (g.emojis?.cache?.size ?? 0), 0) ?? 0,
    roles: guilds?.reduce((acc, g) => acc + (g.roles?.cache?.size ?? 0), 0) ?? 0,
    stickers: guilds?.reduce((acc, g) => acc + (g.stickers?.cache?.size ?? 0), 0) ?? 0,
    commands: commandInfo,
    uptime: client.uptime ?? 0,
    uptimeFormatted: formatUptime(client.uptime ?? 0),
    readyAt: client.readyAt?.toISOString() ?? null,
    ping: client.ws?.ping ?? -1,
    version: PACKAGE_VERSION,
    nodeVersion: process.version,
  };
}

function handleCommands() {
  try {
    const { getCommands, CATEGORIES, CATEGORY_LABELS } = require("../commands/slash/help");
    const COMMANDS = getCommands();
    const categories = {};
    let total = 0;

    for (const catKey of CATEGORIES) {
      const catCmds = COMMANDS[catKey];
      if (!catCmds) continue;

      const commands = Object.entries(catCmds).map(([key, cmd]) => ({
        name: key,
        slash: cmd.slash,
        short: cmd.short,
        usage: cmd.usage,
        aliases: cmd.aliases ?? [],
        description: cmd.description,
      }));

      total += commands.length;
      categories[catKey] = {
        label: CATEGORY_LABELS?.[catKey] ?? catKey,
        count: commands.length,
        commands,
      };
    }

    return { total, categories };
  } catch {
    return { total: 0, categories: {} };
  }
}

function handleBot() {
  const user = botClient?.user;
  const clientId = user?.id ?? apiConfig?.CLIENT_ID ?? process.env.CLIENT_ID ?? "1020772849906098186";

  return {
    id: user?.id ?? null,
    username: user?.username ?? null,
    globalName: user?.globalName ?? null,
    discriminator: user?.discriminator ?? "0",
    avatar: user?.displayAvatarURL?.({ size: 512, extension: "png" }) ?? null,
    avatarDecoration: user?.avatarDecorationURL?.() ?? null,
    banner: user?.bannerURL?.({ size: 1024, extension: "png" }) ?? null,
    accentColor: user?.accentColor ?? null,
    createdAt: user?.createdAt?.toISOString() ?? null,
    createdTimestamp: user?.createdTimestamp ?? null,
    bot: true,
    verified: user?.flags?.has?.("VerifiedBot") ?? false,
    invite: INVITE_URL,
    support: "https://discord.gg/b8AKKaNWU6",
    website: "https://redbot.me",
    defaultPrefix: ".",
    version: PACKAGE_VERSION,
  };
}

function handleHealth() {
  const client = botClient;
  const mem = process.memoryUsage();
  const dbStates = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  const isReady = Boolean(client?.readyAt);

  return {
    status: isReady ? "operational" : "degraded",
    uptime: client?.uptime ?? 0,
    uptimeFormatted: formatUptime(client?.uptime ?? 0),
    processUptime: Math.floor(process.uptime()),
    processUptimeFormatted: formatUptime(process.uptime() * 1000),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    },
    websocket: {
      status: client?.ws?.status ?? -1,
      ping: client?.ws?.ping ?? -1,
      gateway: isReady ? "connected" : "disconnected",
    },
    database: dbStates[mongoose.connection.readyState] ?? "unknown",
    versions: {
      bot: PACKAGE_VERSION,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    readyAt: client?.readyAt?.toISOString() ?? null,
    timestamp: new Date().toISOString(),
  };
}

function issueOAuthState(meta = null) {
  const now = Date.now();
  if (oauthStates.size >= MAX_OAUTH_STATES) {
    for (const [key, entry] of oauthStates) {
      const exp = typeof entry === "number" ? entry : entry?.exp;
      if (!exp || exp <= now) oauthStates.delete(key);
    }
    while (oauthStates.size >= MAX_OAUTH_STATES) {
      const oldest = oauthStates.keys().next().value;
      if (oldest !== undefined) oauthStates.delete(oldest);
      else break;
    }
  }
  const raw = crypto.randomBytes(24).toString("hex");
  const state = meta?.mode === "dashboard" ? `dash_${raw}` : raw;
  oauthStates.set(state, {
    exp: now + OAUTH_STATE_TTL_MS,
    ...(meta && typeof meta === "object" ? meta : {}),
  });
  return state;
}

function consumeOAuthStateEntry(state) {
  if (!state || typeof state !== "string") return null;
  const rawEntry = oauthStates.get(state);
  if (!rawEntry) return null;
  oauthStates.delete(state);
  const entry = typeof rawEntry === "number" ? { exp: rawEntry } : rawEntry;
  if (!entry || !entry.exp || entry.exp <= Date.now()) return null;
  return entry;
}

function consumeOAuthState(state) {
  return Boolean(consumeOAuthStateEntry(state));
}

function getSessionSecret() {
  return (
    apiConfig?.SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    apiConfig?.CLIENT_SECRET ||
    process.env.CLIENT_SECRET ||
    apiConfig?.API_KEY ||
    process.env.API_KEY ||
    apiConfig?.TOKEN ||
    process.env.TOKEN ||
    "redbot-local-session-secret"
  );
}

function hasManageGuildBits(permissionsStr, isOwner = false) {
  if (isOwner === true) return true;
  try {
    const perms = BigInt(permissionsStr || "0");
    const ADMINISTRATOR = 1n << 3n;
    const MANAGE_GUILD = 1n << 5n;
    return (perms & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
  } catch {
    return false;
  }
}

function createDashboardSession({ user, guilds }) {
  const now = Date.now();
  const manageableGuilds = (Array.isArray(guilds) ? guilds : []).filter((g) =>
    g?.id && hasManageGuildBits(g.permissions, g.owner)
  );
  if (dashboardSessions.size >= MAX_DASHBOARD_SESSIONS) {
    for (const [k, s] of dashboardSessions) {
      if (!s || s.exp <= now) dashboardSessions.delete(k);
    }
    while (dashboardSessions.size >= MAX_DASHBOARD_SESSIONS) {
      const oldest = dashboardSessions.keys().next().value;
      if (oldest !== undefined) dashboardSessions.delete(oldest);
      else break;
    }
  }
  const sid = crypto.randomBytes(16).toString("hex");
  const exp = now + DASHBOARD_SESSION_TTL_MS;
  dashboardSessions.set(sid, { user, guilds: manageableGuilds, exp });

  const payload = {
    sid,
    uid: String(user.id),
    username: String(user.username || ""),
    globalName: user.globalName ? String(user.globalName) : null,
    avatar: user.avatar || null,
    adminGuildIds: manageableGuilds.map((g) => String(g.id)).slice(0, 200),
    exp,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verifyDashboardSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return null;
  const dotIdx = rawToken.indexOf(".");
  if (dotIdx <= 0) return null;
  const payloadB64 = rawToken.slice(0, dotIdx);
  const sig = rawToken.slice(dotIdx + 1);
  if (!payloadB64 || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
  if (!safeEqualString(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || !payload.uid || !payload.exp) return null;
    if (Number(payload.exp) <= Date.now()) return null;
    const cachedRaw = payload.sid ? dashboardSessions.get(payload.sid) : null;
    const cached = cachedRaw && cachedRaw.exp > Date.now() ? cachedRaw : null;
    return { ...payload, cached };
  } catch {
    return null;
  }
}

function getRequestSession(req) {
  const auth = req.headers?.authorization ?? "";
  const spaceIdx = auth.indexOf(" ");
  if (spaceIdx > 0) {
    const scheme = auth.slice(0, spaceIdx);
    const token = auth.slice(spaceIdx + 1).trim();
    if (scheme.toLowerCase() === "bearer" && token) {
      const fromHeader = verifyDashboardSessionToken(token);
      if (fromHeader) return fromHeader;
    }
  }
  const cookieToken = parseCookies(req).redbot_session;
  if (cookieToken) {
    return verifyDashboardSessionToken(cookieToken);
  }
  return null;
}

function canManageGuild(session, guildId, guild = null) {
  if (!session) return false;
  const gid = String(guildId);
  if (Array.isArray(session.adminGuildIds) && session.adminGuildIds.includes(gid)) return true;
  if (guild && String(guild.ownerId) === String(session.uid)) return true;
  const member = guild?.members?.cache?.get?.(String(session.uid));
  if (member?.permissions?.has?.(["ManageGuild"]) || member?.permissions?.has?.(["Administrator"])) {
    return true;
  }
  return false;
}

function resolveSafeReturnUrl(rawUrl) {
  const fallback = apiConfig?.DASHBOARD_URL || process.env.DASHBOARD_URL || "https://redbot.me/tickets";
  if (!rawUrl || typeof rawUrl !== "string") return fallback;
  try {
    const parsed = new URL(rawUrl);
    const isProdOrigin = parsed.protocol === "https:" && (parsed.hostname === "redbot.me" || parsed.hostname === "www.redbot.me");
    const isLocalOrigin = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (!isProdOrigin && !isLocalOrigin) return fallback;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function resolveEffectiveRedirectUri(urlObj) {
  const candidate = urlObj.searchParams.get("redirect_uri");
  if (candidate && typeof candidate === "string") {
    try {
      const parsed = new URL(candidate);
      if (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        (parsed.pathname.endsWith("/api/oauth/callback") || parsed.pathname.endsWith("/oauth/callback"))
      ) {
        return parsed.toString();
      }
    } catch {}
  }
  return getOAuthSettings().redirectUri;
}

function isSecureRequest(req, redirectUri) {
  return Boolean(
    req.socket?.encrypted ||
    req.headers?.["x-forwarded-proto"] === "https" ||
    String(redirectUri || "").startsWith("https://")
  );
}

function handleInviteRedirect(req, res, urlObj) {
  const { clientId, redirectUri, permissions } = getOAuthSettings();
  if (!clientId) {
    return sendHtml(res, 503, "RedBot Invite", "Configuración incompleta", "CLIENT_ID no está configurado.");
  }

  const state = issueOAuthState();
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(permissions || "8"),
    integration_type: "0",
    scope: "bot applications.commands identify",
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });

  const guildId = urlObj.searchParams.get("guild_id");
  if (guildId && /^\d{17,22}$/.test(guildId)) {
    params.set("guild_id", guildId);
  }

  const secureAttr = isSecureRequest(req, redirectUri) ? "; Secure" : "";
  res.writeHead(302, {
    Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
    "Cache-Control": "no-store",
    "Set-Cookie": `redbot_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secureAttr}`,
  });
  res.end();
}

async function exchangeDiscordOAuth({ code, clientId, clientSecret, redirectUri }) {
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!tokenRes.ok) {
    throw new Error(`Discord token exchange failed (${tokenRes.status})`);
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData?.access_token;
  if (!accessToken) {
    throw new Error("Discord token exchange missing access_token");
  }

  const userRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!userRes.ok) {
    throw new Error(`Discord user profile fetch failed (${userRes.status})`);
  }
  const userData = await userRes.json();
  return {
    userId: userData?.id ? String(userData.id) : null,
    locale: userData?.locale ? String(userData.locale) : null,
    tokenGuildId: tokenData?.guild?.id ? String(tokenData.guild.id) : null,
  };
}

async function exchangeDiscordDashboardOAuth({ code, clientId, clientSecret, redirectUri }) {
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!tokenRes.ok) {
    throw new Error(`Discord token exchange failed (${tokenRes.status})`);
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData?.access_token;
  if (!accessToken) {
    throw new Error("Discord token exchange missing access_token");
  }

  const [userRes, guildsRes] = await Promise.all([
    fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    }),
    fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    }),
  ]);

  if (!userRes.ok) {
    throw new Error(`Discord user profile fetch failed (${userRes.status})`);
  }
  if (!guildsRes.ok) {
    throw new Error(`Discord user guilds fetch failed (${guildsRes.status})`);
  }

  const [userData, guildsData] = await Promise.all([userRes.json(), guildsRes.json()]);
  if (!userData?.id) {
    throw new Error("Discord user profile missing id");
  }

  return {
    user: {
      id: String(userData.id),
      username: String(userData.username || ""),
      globalName: userData.global_name ? String(userData.global_name) : (userData.globalName ? String(userData.globalName) : null),
      avatar: userData.avatar ? String(userData.avatar) : null,
    },
    guilds: Array.isArray(guildsData) ? guildsData : [],
  };
}

function handleAuthLoginRedirect(req, res, urlObj) {
  const { clientId, clientSecret } = getOAuthSettings();
  if (!clientId || !clientSecret) {
    return sendHtml(
      res,
      503,
      "RedBot Dashboard",
      "OAuth2 no configurado",
      "Falta configurar CLIENT_ID o CLIENT_SECRET en el servidor del bot."
    );
  }

  const returnTo = resolveSafeReturnUrl(urlObj.searchParams.get("return_to"));
  const redirectUri = resolveEffectiveRedirectUri(urlObj);
  const state = issueOAuthState({ mode: "dashboard", returnTo, redirectUri });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify guilds",
    state,
  });

  const secureAttr = isSecureRequest(req, redirectUri) ? "; Secure" : "";
  res.writeHead(302, {
    Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
    "Cache-Control": "no-store",
    "Set-Cookie": `redbot_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secureAttr}`,
  });
  res.end();
}

function handleDashboardGuilds(req, res) {
  const session = getRequestSession(req);
  if (!session) {
    return json(res, 401, { error: "Unauthorized" }, { noStore: true });
  }

  const byId = new Map();
  const botGuilds = botClient?.guilds?.cache;

  for (const g of session.cached?.guilds ?? []) {
    if (!g?.id) continue;
    const id = String(g.id);
    const botGuild = botGuilds?.get?.(id) ?? null;
    byId.set(id, {
      id,
      name: botGuild?.name ?? String(g.name || id),
      icon: botGuild?.iconURL?.({ size: 128 }) ?? (g.icon ? `https://cdn.discordapp.com/icons/${id}/${g.icon}.png?size=128` : null),
      botPresent: Boolean(botGuild),
      memberCount: botGuild?.memberCount ?? null,
    });
  }

  if (botGuilds) {
    const adminSet = new Set((session.adminGuildIds || []).map(String));
    for (const bg of botGuilds.values()) {
      const id = String(bg.id);
      if (byId.has(id)) {
        const existing = byId.get(id);
        existing.botPresent = true;
        existing.name = bg.name ?? existing.name;
        existing.icon = bg.iconURL?.({ size: 128 }) ?? existing.icon;
        existing.memberCount = bg.memberCount ?? existing.memberCount;
        continue;
      }
      const member = bg.members?.cache?.get?.(String(session.uid));
      const isAllowed =
        adminSet.has(id) ||
        String(bg.ownerId) === String(session.uid) ||
        Boolean(member?.permissions?.has?.(["ManageGuild"]) || member?.permissions?.has?.(["Administrator"]));
      if (isAllowed) {
        byId.set(id, {
          id,
          name: bg.name ?? id,
          icon: bg.iconURL?.({ size: 128 }) ?? null,
          botPresent: true,
          memberCount: bg.memberCount ?? null,
        });
      }
    }
  }

  const guilds = [...byId.values()].sort((a, b) => {
    if (a.botPresent !== b.botPresent) return a.botPresent ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });

  return json(
    res,
    200,
    {
      authenticated: true,
      user: {
        id: session.uid,
        username: session.username,
        globalName: session.globalName,
        avatar: session.avatar,
      },
      guilds,
    },
    { noStore: true }
  );
}

function handleAuthLogout(req, res) {
  const session = getRequestSession(req);
  if (session?.sid) {
    dashboardSessions.delete(session.sid);
  }
  const { redirectUri } = getOAuthSettings();
  const secureAttr = isSecureRequest(req, redirectUri) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `redbot_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureAttr}`);
  return json(res, 200, { ok: true }, { noStore: true });
}

async function handleOAuthCallback(req, res, urlObj) {
  const { clientId, clientSecret, redirectUri, successUrl } = getOAuthSettings();
  const secureAttr = isSecureRequest(req, redirectUri) ? "; Secure" : "";
  const clearCookie = `redbot_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureAttr}`;

  const oauthError = urlObj.searchParams.get("error");
  if (oauthError) {
    return sendHtml(
      res,
      200,
      "RedBot OAuth2",
      "Autorización cancelada",
      "No se completó la invitación de RedBot. Puedes cerrar esta pestaña e intentarlo de nuevo.",
      { "Set-Cookie": clearCookie }
    );
  }

  if (!clientId || !clientSecret) {
    return sendHtml(
      res,
      503,
      "RedBot OAuth2",
      "OAuth2 no configurado",
      "Falta configurar CLIENT_SECRET en el servidor del bot.",
      { "Set-Cookie": clearCookie }
    );
  }

  const code = urlObj.searchParams.get("code") || "";
  if (!code || code.length > 512) {
    return sendHtml(
      res,
      400,
      "RedBot OAuth2",
      "Código inválido",
      "Falta el parámetro code de Discord.",
      { "Set-Cookie": clearCookie }
    );
  }

  const stateParam = urlObj.searchParams.get("state") || "";
  const cookieState = parseCookies(req).redbot_oauth_state || "";
  const isDashboardFlow = stateParam.startsWith("dash_");
  const requireState = apiConfig?.OAUTH_REQUIRE_STATE === true || process.env.OAUTH_REQUIRE_STATE === "true";

  let stateEntry = null;
  if (isDashboardFlow || requireState || stateParam || cookieState) {
    const cookieMatches = !cookieState || safeEqualString(stateParam, cookieState);
    stateEntry = cookieMatches ? consumeOAuthStateEntry(stateParam) : null;
    if (!stateEntry || (isDashboardFlow && stateEntry.mode !== "dashboard")) {
      return sendHtml(
        res,
        403,
        "RedBot OAuth2",
        "Estado de seguridad inválido",
        isDashboardFlow
          ? "La sesión de inicio de sesión expiró o no es válida. Vuelve al panel e inténtalo de nuevo."
          : "La sesión de invitación expiró o no es válida. Vuelve a abrir redbot.me/invite.",
        { "Set-Cookie": clearCookie }
      );
    }
  }

  try {
    if (isDashboardFlow) {
      const { user, guilds } = await exchangeDiscordDashboardOAuth({
        code,
        clientId,
        clientSecret,
        redirectUri: stateEntry.redirectUri || redirectUri,
      });
      const token = createDashboardSession({ user, guilds });
      const returnUrl = resolveSafeReturnUrl(stateEntry.returnTo);
      const location = `${returnUrl.split("#")[0]}#session=${encodeURIComponent(token)}`;
      const sessionCookie = `redbot_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secureAttr}`;
      res.writeHead(302, {
        Location: location,
        "Cache-Control": "no-store",
        "Set-Cookie": [clearCookie, sessionCookie],
      });
      return res.end();
    }

    const { userId, locale, tokenGuildId } = await exchangeDiscordOAuth({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    const queryGuildId = urlObj.searchParams.get("guild_id");
    const guildId = (queryGuildId && /^\d{17,22}$/.test(queryGuildId))
      ? queryGuildId
      : (tokenGuildId && /^\d{17,22}$/.test(tokenGuildId) ? tokenGuildId : null);

    const applied = await applyOauthGuildLang({ guildId, userId, locale });
    log?.info("OAuth2 callback procesado", { guildId: guildId ?? null, lang: applied.lang });

    if (successUrl && /^https?:\/\//i.test(successUrl)) {
      const target = new URL(successUrl);
      target.searchParams.set("lang", applied.lang);
      if (guildId) target.searchParams.set("guild_id", guildId);
      res.writeHead(302, {
        Location: target.toString(),
        "Cache-Control": "no-store",
        "Set-Cookie": clearCookie,
      });
      return res.end();
    }

    const isEn = applied.lang === "en";
    return sendHtml(
      res,
      200,
      isEn ? "RedBot added" : "RedBot añadido",
      isEn ? "RedBot has been added" : "RedBot ha sido añadido",
      isEn
        ? "Language automatically configured to English based on your Discord settings. You can close this tab."
        : "Idioma configurado automáticamente en Español según tu configuración de Discord. Ya puedes cerrar esta pestaña.",
      { "Set-Cookie": clearCookie }
    );
  } catch (err) {
    log?.warn("Error en callback OAuth2", { err: err?.message ?? String(err) });
    return sendHtml(
      res,
      502,
      "RedBot OAuth2",
      "No se pudo completar la verificación",
      "Discord no respondió correctamente al validar la invitación. RedBot seguirá funcionando con su configuración por defecto.",
      { "Set-Cookie": clearCookie }
    );
  }
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
        reject(err);
        req.destroy();
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

async function handleTicketsRoute(req, res, pathname) {
  const match = pathname.match(/^\/api\/tickets\/(\d{17,22})(?:\/(config|panel))?$/);
  if (!match) return false;

  const guildId = match[1];
  const sub = match[2] || "";
  const guild = botClient?.guilds?.cache?.get(guildId) ?? null;

  const session = getRequestSession(req);
  const hasApiKey = Boolean(apiConfig?.API_KEY) && isAuthorized(req);
  if (session) {
    if (!canManageGuild(session, guildId, guild)) {
      json(res, 403, { error: "No tienes permisos de administración (ManageGuild) en este servidor." });
      return true;
    }
  } else if (!hasApiKey) {
    const requireAuth = Boolean(apiConfig?.API_KEY || apiConfig?.CLIENT_SECRET || process.env.CLIENT_SECRET);
    if (requireAuth) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
  }

  if (!sub) {
    if (req.method !== "GET") {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    if (!guild) {
      json(res, 404, { error: "Guild not found" });
      return true;
    }

    const { getTicketConfig } = require("./tickets");
    const { Ticket } = require("./database");
    const cfg = await getTicketConfig(guildId);
    let open = 0;
    let closed = 0;
    if (mongoose.connection.readyState === 1) {
      [open, closed] = await Promise.all([
        Ticket.countDocuments({ guildId, status: "open" }).catch(() => 0),
        Ticket.countDocuments({ guildId, status: "closed" }).catch(() => 0),
      ]);
    }

    const allChannels = [...(guild.channels?.cache?.values?.() ?? [])];
    const categories = allChannels
      .filter((c) => c.type === ChannelType.GuildCategory)
      .map((c) => ({ id: c.id, name: c.name }));
    const textChannels = allChannels
      .filter((c) => c.isTextBased?.() && c.type !== ChannelType.GuildCategory)
      .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId ?? null }));
    const roles = [...(guild.roles?.cache?.values?.() ?? [])]
      .filter((r) => r.id !== guild.id && !r.managed)
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
      .map((r) => ({ id: r.id, name: r.name, color: r.hexColor ?? "#99aab5" }));
    const emojis = [...(guild.emojis?.cache?.values?.() ?? [])]
      .slice(0, 100)
      .map((e) => ({
        id: e.id,
        name: e.name,
        animated: Boolean(e.animated),
        identifier: `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`,
        url: e.imageURL?.({ size: 64 }) ?? `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}?size=64`,
      }));

    json(
      res,
      200,
      {
        guild: { id: guild.id, name: guild.name, icon: guild.iconURL?.({ size: 256 }) ?? null },
        ticketConfig: cfg,
        stats: { open, closed },
        channels: { categories, text: textChannels },
        roles,
        emojis,
      },
      { noStore: true }
    );
    return true;
  }

  if (sub === "config") {
    if (req.method !== "PUT" && req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    if (!guild) {
      json(res, 404, { error: "Guild not found" });
      return true;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      json(res, err?.statusCode || 400, { error: err?.message || "Invalid JSON" });
      return true;
    }

    const { getTicketConfig, parseTicketMenuOptions, updateTicketConfig } = require("./tickets");
    const patch = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.categoryId !== undefined) {
      if (body.categoryId === null || body.categoryId === "") {
        patch.categoryId = null;
      } else {
        const ch = guild.channels?.cache?.get(String(body.categoryId));
        if (!ch || ch.type !== ChannelType.GuildCategory) {
          json(res, 400, { error: "Invalid categoryId" });
          return true;
        }
        patch.categoryId = ch.id;
      }
    }
    if (body.logChannelId !== undefined) {
      if (body.logChannelId === null || body.logChannelId === "") {
        patch.logChannelId = null;
      } else {
        const ch = guild.channels?.cache?.get(String(body.logChannelId));
        if (!ch?.isTextBased?.()) {
          json(res, 400, { error: "Invalid logChannelId" });
          return true;
        }
        patch.logChannelId = ch.id;
      }
    }
    if (body.supportRoleId !== undefined) {
      if (body.supportRoleId === null || body.supportRoleId === "") {
        patch.supportRoleId = null;
      } else {
        const role = guild.roles?.cache?.get(String(body.supportRoleId));
        if (!role || role.id === guild.id) {
          json(res, 400, { error: "Invalid supportRoleId" });
          return true;
        }
        patch.supportRoleId = role.id;
      }
    }
    if (typeof body.welcomeMessage === "string" && body.welcomeMessage.trim()) {
      patch.welcomeMessage = body.welcomeMessage.trim().slice(0, 1500);
    }
    if (typeof body.panelPlaceholder === "string" && body.panelPlaceholder.trim()) {
      patch.panelPlaceholder = body.panelPlaceholder.trim().slice(0, 100);
    }
    if (body.categories !== undefined) {
      patch.categories = parseTicketMenuOptions(body.categories);
    }

    const updated = Object.keys(patch).length
      ? await updateTicketConfig(guildId, patch)
      : await getTicketConfig(guildId);
    if (!updated) {
      json(res, 503, { error: "Database unavailable" });
      return true;
    }

    json(res, 200, { ok: true, ticketConfig: updated }, { noStore: true });
    return true;
  }

  if (sub === "panel") {
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    if (!guild) {
      json(res, 404, { error: "Guild not found" });
      return true;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      json(res, err?.statusCode || 400, { error: err?.message || "Invalid JSON" });
      return true;
    }

    const channelId = String(body.channelId ?? "").trim();
    const targetCh = channelId
      ? (guild.channels?.cache?.get(channelId) ?? await guild.channels?.fetch?.(channelId).catch(() => null))
      : null;
    if (!targetCh?.isTextBased?.()) {
      json(res, 400, { error: "Invalid text channelId" });
      return true;
    }

    const { getTicketConfig, parseTicketMenuOptions, updateTicketConfig, buildTicketPanelPayload } = require("./tickets");
    const { getLang } = require("./guild");
    const lang = body.lang === "en" || body.lang === "es"
      ? body.lang
      : await getLang(guildId).catch(() => "es");

    const parsedOptions = body.options !== undefined
      ? parseTicketMenuOptions(body.options)
      : (body.categories !== undefined ? parseTicketMenuOptions(body.categories) : null);

    let effectiveOptions = parsedOptions;
    if (effectiveOptions === null && body.useStoredCategories !== false) {
      const stored = await getTicketConfig(guildId);
      if (stored?.categories?.length && body.mode !== "button") {
        effectiveOptions = stored.categories;
      }
    }

    if (body.saveConfig !== false) {
      const savePatch = { enabled: true };
      if (Array.isArray(effectiveOptions) && effectiveOptions.length) {
        savePatch.categories = effectiveOptions;
      }
      if (typeof body.placeholder === "string" && body.placeholder.trim()) {
        savePatch.panelPlaceholder = body.placeholder.trim().slice(0, 100);
      }
      await updateTicketConfig(guildId, savePatch).catch(() => {});
    }

    const payload = buildTicketPanelPayload({
      title: body.title ? String(body.title).slice(0, 100) : null,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      category: body.category ? String(body.category).slice(0, 40) : "General",
      buttonLabel: body.buttonLabel ? String(body.buttonLabel).slice(0, 80) : null,
      placeholder: body.placeholder ? String(body.placeholder).slice(0, 100) : null,
      options: effectiveOptions?.length ? effectiveOptions : null,
      lang,
    });

    const editMessageId = body.messageId && /^\d{17,22}$/.test(String(body.messageId)) ? String(body.messageId) : null;
    let sent = null;
    if (editMessageId && targetCh.messages?.fetch) {
      const existingMsg = await targetCh.messages.fetch(editMessageId).catch(() => null);
      if (existingMsg?.editable) {
        sent = await existingMsg.edit(payload).catch(() => null);
      }
    }
    if (!sent) {
      sent = await targetCh.send(payload);
    }

    json(res, 200, { ok: true, channelId: targetCh.id, messageId: sent?.id ?? null }, { noStore: true });
    return true;
  }

  return false;
}

const routes = new Map([
  ["/api", handleRoot],
  ["/api/stats", handleStats],
  ["/api/commands", handleCommands],
  ["/api/bot", handleBot],
  ["/api/health", handleHealth],
]);

async function handleRequest(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  let urlObj;
  try {
    urlObj = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  } catch {
    urlObj = new URL("http://localhost/");
  }
  let pathname = urlObj.pathname.replace(/\/+$/, "") || "/api";
  if (pathname === "/") pathname = "/api";

  const isTicketRoute = pathname.startsWith("/api/tickets/");
  const isLogoutRoute = pathname === "/auth/logout" || pathname === "/api/auth/logout";
  const isSessionRoute = isTicketRoute || pathname === "/api/auth/me" || pathname === "/api/dashboard/guilds";

  if (isTicketRoute && !["GET", "POST", "PUT"].includes(req.method)) {
    return json(res, 405, { error: "Method not allowed" });
  }
  if (isLogoutRoute && !["GET", "POST"].includes(req.method)) {
    return json(res, 405, { error: "Method not allowed" });
  }
  if (!isTicketRoute && !isLogoutRoute && req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  // X-Forwarded-For solo se respeta con TRUST_PROXY=true (detras de un proxy que lo sobrescriba)
  const ip = (apiConfig?.TRUST_PROXY ? req.headers["x-forwarded-for"]?.split(",")[0]?.trim() : null)
    || req.socket?.remoteAddress
    || "unknown";
  const { remaining, exceeded } = checkRate(ip);
  res.setHeader("X-RateLimit-Limit", String(RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(remaining));

  if (exceeded) {
    res.setHeader("Retry-After", "60");
    return json(res, 429, { error: "Too many requests", retryAfter: 60 });
  }

  const hasSession = isSessionRoute ? Boolean(getRequestSession(req)) : false;
  if (!PUBLIC_BROWSER_ROUTES.has(pathname) && !hasSession && !isAuthorized(req)) {
    return json(res, 401, { error: "Unauthorized" });
  }

  if (isTicketRoute) {
    try {
      const handled = await handleTicketsRoute(req, res, pathname);
      if (handled) return;
    } catch (err) {
      log?.error("Error en endpoint de tickets", { endpoint: pathname, err: err?.message ?? String(err) });
      return json(res, 500, { error: "Internal server error" });
    }
  }

  if (pathname === "/invite" || pathname === "/api/invite") {
    return handleInviteRedirect(req, res, urlObj);
  }
  if (pathname === "/auth/login" || pathname === "/api/auth/login") {
    return handleAuthLoginRedirect(req, res, urlObj);
  }
  if (pathname === "/api/auth/me" || pathname === "/api/dashboard/guilds") {
    return handleDashboardGuilds(req, res);
  }
  if (isLogoutRoute) {
    return handleAuthLogout(req, res);
  }
  if (pathname === "/oauth/callback" || pathname === "/api/oauth/callback") {
    return handleOAuthCallback(req, res, urlObj);
  }

  const handler = routes.get(pathname);
  if (!handler) {
    return json(res, 404, {
      error: "Endpoint not found",
      endpoints: [
        ...routes.keys(),
        "/api/invite",
        "/api/oauth/callback",
        "/api/auth/login",
        "/api/auth/me",
        "/api/auth/logout",
        "/api/dashboard/guilds",
        "/api/tickets/:guildId",
        "/api/tickets/:guildId/config",
        "/api/tickets/:guildId/panel",
      ],
    });
  }

  try {
    json(res, 200, handler());
  } catch (err) {
    log?.error("Error en endpoint de API", { endpoint: pathname, err: err?.message ?? String(err) });
    json(res, 500, { error: "Internal server error" });
  }
}

function setApiContext({ client = null, config = null, logger = null } = {}) {
  botClient = client;
  apiConfig = config;
  log = logger ?? new Logger("API");
}

function startApi(client, config, logger) {
  return new Promise((resolve) => {
    setApiContext({ client, config, logger });

    const port = Number(config?.API_PORT) || 3000;
    const host = config?.API_HOST || process.env.API_HOST || undefined;
    server = http.createServer((req, res) => {
      Promise.resolve(handleRequest(req, res)).catch((err) => {
        log?.error("Error no controlado en API", { err: err?.message ?? String(err) });
        if (!res.headersSent) json(res, 500, { error: "Internal server error" });
      });
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        log.warn(`Puerto ${port} en uso, API no iniciada`);
        server = null;
        resolve();
        return;
      }
      log.error("Error en servidor API", { err: err.message });
    });

    const onListen = () => {
      log.info("API iniciada", {
        port,
        ...(host ? { host } : {}),
        auth: config?.API_KEY ? "API key" : "pública (sin key)",
        cors: config?.API_CORS_ORIGIN || "*",
      });

      ratePruneTimer = setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of rateStore) {
          if (now - entry.start > RATE_WINDOW_MS * 2) rateStore.delete(ip);
        }
        for (const [state, entry] of oauthStates) {
          const exp = typeof entry === "number" ? entry : entry?.exp;
          if (!exp || exp <= now) oauthStates.delete(state);
        }
        for (const [sid, session] of dashboardSessions) {
          if (!session || session.exp <= now) dashboardSessions.delete(sid);
        }
      }, 5 * 60_000);
      ratePruneTimer.unref();

      resolve();
    };

    if (host) server.listen(port, host, onListen);
    else server.listen(port, onListen);
  });
}

function stopApi() {
  return new Promise((resolve) => {
    if (ratePruneTimer) {
      clearInterval(ratePruneTimer);
      ratePruneTimer = null;
    }
    rateStore.clear();
    oauthStates.clear();
    dashboardSessions.clear();

    if (!server) return resolve();

    server.close((err) => {
      if (err) log?.error("Error cerrando API", { err: err.message });
      else log?.info("API cerrada");
      server = null;
      resolve();
    });
  });
}

module.exports = { startApi, stopApi, handleRequest, setApiContext };
