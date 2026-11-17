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
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const MAX_RATE_ENTRIES = 5000;
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const MAX_OAUTH_STATES = 2000;
const PUBLIC_BROWSER_ROUTES = new Set(["/invite", "/api/invite", "/oauth/callback", "/api/oauth/callback"]);
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
      { path: "/api/oauth/callback", description: "Callback OAuth2 de Discord para detectar idioma inicial" },
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

function issueOAuthState() {
  const now = Date.now();
  if (oauthStates.size >= MAX_OAUTH_STATES) {
    for (const [key, exp] of oauthStates) {
      if (exp <= now) oauthStates.delete(key);
    }
    while (oauthStates.size >= MAX_OAUTH_STATES) {
      const oldest = oauthStates.keys().next().value;
      if (oldest !== undefined) oauthStates.delete(oldest);
      else break;
    }
  }
  const state = crypto.randomBytes(24).toString("hex");
  oauthStates.set(state, now + OAUTH_STATE_TTL_MS);
  return state;
}

function consumeOAuthState(state) {
  if (!state || typeof state !== "string") return false;
  const exp = oauthStates.get(state);
  if (!exp) return false;
  oauthStates.delete(state);
  return exp > Date.now();
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
  const requireState = apiConfig?.OAUTH_REQUIRE_STATE === true || process.env.OAUTH_REQUIRE_STATE === "true";
  if (requireState || stateParam || cookieState) {
    const cookieMatches = !cookieState || safeEqualString(stateParam, cookieState);
    if (!cookieMatches || !consumeOAuthState(stateParam)) {
      return sendHtml(
        res,
        403,
        "RedBot OAuth2",
        "Estado de seguridad inválido",
        "La sesión de invitación expiró o no es válida. Vuelve a abrir redbot.me/invite.",
        { "Set-Cookie": clearCookie }
      );
    }
  }

  try {
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

    json(
      res,
      200,
      {
        guild: { id: guild.id, name: guild.name, icon: guild.iconURL?.({ size: 256 }) ?? null },
        ticketConfig: cfg,
        stats: { open, closed },
        channels: { categories, text: textChannels },
        roles,
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
  if (!isTicketRoute && req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }
  if (isTicketRoute && !["GET", "POST", "PUT"].includes(req.method)) {
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

  if (!PUBLIC_BROWSER_ROUTES.has(pathname) && !isAuthorized(req)) {
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
  if (pathname === "/oauth/callback" || pathname === "/api/oauth/callback") {
    return handleOAuthCallback(req, res, urlObj);
  }

  const handler = routes.get(pathname);
  if (!handler) {
    return json(res, 404, {
      error: "Endpoint not found",
      endpoints: [...routes.keys(), "/api/invite", "/api/oauth/callback", "/api/tickets/:guildId", "/api/tickets/:guildId/config", "/api/tickets/:guildId/panel"],
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
        for (const [state, exp] of oauthStates) {
          if (exp <= now) oauthStates.delete(state);
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
