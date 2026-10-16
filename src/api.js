const http = require("http");
const mongoose = require("mongoose");
const { ChannelType } = require("discord.js");
const { Logger } = require("./runtime");
const { version: PACKAGE_VERSION } = require("../package.json");

let server = null;
let botClient = null;
let apiConfig = null;
let log = null;

const rateStore = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
let ratePruneTimer = null;

function checkRate(ip) {
  const now = Date.now();
  let entry = rateStore.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    entry = { start: now, hits: 0 };
    rateStore.set(ip, entry);
  }
  entry.hits++;
  return {
    remaining: Math.max(0, RATE_MAX - entry.hits),
    exceeded: entry.hits > RATE_MAX,
  };
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": status === 200 ? "public, max-age=15" : "no-store",
  });
  res.end(body);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", apiConfig?.API_CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}

function isAuthorized(req) {
  const key = apiConfig?.API_KEY;
  if (!key) return true;
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token === key;
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

function handleRoot() {
  return {
    name: "RedBot API",
    version: PACKAGE_VERSION,
    endpoints: [
      { path: "/api/stats", description: "Estadísticas generales del bot" },
      { path: "/api/commands", description: "Catálogo completo de comandos" },
      { path: "/api/bot", description: "Perfil e identidad del bot" },
      { path: "/api/health", description: "Estado de salud del sistema" },
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
    invite: `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=0&scope=bot`,
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

const routes = new Map([
  ["/api", handleRoot],
  ["/api/stats", handleStats],
  ["/api/commands", handleCommands],
  ["/api/bot", handleBot],
  ["/api/health", handleHealth],
]);

function handleRequest(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";
  const { remaining, exceeded } = checkRate(ip);
  res.setHeader("X-RateLimit-Limit", String(RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(remaining));

  if (exceeded) {
    res.setHeader("Retry-After", "60");
    return json(res, 429, { error: "Too many requests", retryAfter: 60 });
  }

  if (!isAuthorized(req)) {
    return json(res, 401, { error: "Unauthorized" });
  }

  let pathname;
  try {
    pathname = new URL(req.url, `http://${req.headers.host ?? "localhost"}`).pathname;
  } catch {
    pathname = req.url?.split("?")[0] ?? "/";
  }
  pathname = pathname.replace(/\/+$/, "") || "/api";
  if (pathname === "/") pathname = "/api";

  const handler = routes.get(pathname);
  if (!handler) {
    return json(res, 404, {
      error: "Endpoint not found",
      endpoints: [...routes.keys()],
    });
  }

  try {
    json(res, 200, handler());
  } catch (err) {
    log?.error("Error en endpoint de API", { endpoint: pathname, err: err?.message ?? String(err) });
    json(res, 500, { error: "Internal server error" });
  }
}

function startApi(client, config, logger) {
  return new Promise((resolve) => {
    botClient = client;
    apiConfig = config;
    log = logger ?? new Logger("API");

    const port = Number(config?.API_PORT) || 3000;
    server = http.createServer(handleRequest);

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        log.warn(`Puerto ${port} en uso, API no iniciada`);
        server = null;
        resolve();
        return;
      }
      log.error("Error en servidor API", { err: err.message });
    });

    server.listen(port, () => {
      log.info("API iniciada", {
        port,
        auth: config?.API_KEY ? "API key" : "pública (sin key)",
        cors: config?.API_CORS_ORIGIN || "*",
      });

      ratePruneTimer = setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of rateStore) {
          if (now - entry.start > RATE_WINDOW_MS * 2) rateStore.delete(ip);
        }
      }, 5 * 60_000);
      ratePruneTimer.unref();

      resolve();
    });
  });
}

function stopApi() {
  return new Promise((resolve) => {
    if (ratePruneTimer) {
      clearInterval(ratePruneTimer);
      ratePruneTimer = null;
    }
    rateStore.clear();

    if (!server) return resolve();

    server.close((err) => {
      if (err) log?.error("Error cerrando API", { err: err.message });
      else log?.info("API cerrada");
      server = null;
      resolve();
    });
  });
}

module.exports = { startApi, stopApi };
