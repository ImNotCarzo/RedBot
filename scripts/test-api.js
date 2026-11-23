const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const { createRequire } = require("module");
const net = require("net");
const path = require("path");
const vm = require("vm");
const mongoose = require("mongoose");
const { ChannelType } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_COMMIT = "2d06da3";
const GUILD_ALLOWED = "111111111111111111";
const GUILD_OWNER = "666666666666666666";
const GUILD_ABSENT = "777777777777777777";
const GUILD_FORBIDDEN = "888888888888888888";
const GUILD_MISSING = "999888777666555444";
const USER_ID = "222222222222222222";
const CAT_ID = "333333333333333333";
const TEXT_CH_ID = "444444444444444444";
const ROLE_ID = "555555555555555555";
const TEST_API_KEY = "test-api-key-8b";
const TEST_CLIENT_ID = "999999999999999999";
const TEST_CLIENT_SECRET = "test-client-secret-8b";
const TEST_SESSION_SECRET = "test-session-secret-8b";

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function httpRequest(port, { method = "GET", path: reqPath, headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const finalHeaders = { Connection: "close", ...headers };
    let payload = null;
    if (body !== null && body !== undefined) {
      payload = Buffer.isBuffer(body)
        ? body
        : Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8");
      if (!finalHeaders["Content-Type"]) finalHeaders["Content-Type"] = "application/json";
      if (!finalHeaders["Content-Length"]) finalHeaders["Content-Length"] = String(payload.length);
    }

    const req = http.request(
      { hostname: "127.0.0.1", port, path: reqPath, method, headers: finalHeaders, agent: false },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          if (String(res.headers["content-type"] || "").includes("application/json")) {
            try { json = JSON.parse(text); } catch {}
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function countResourceTypes() {
  const counts = { TCPServerWrap: 0, Timeout: 0 };
  if (typeof process.getActiveResourcesInfo !== "function") return counts;
  for (const name of process.getActiveResourcesInfo()) {
    if (name === "TCPServerWrap") counts.TCPServerWrap++;
    else if (name === "Timeout") counts.Timeout++;
  }
  return counts;
}

function loadBaselineApi() {
  try {
    const source = execFileSync("git", ["show", `${BASELINE_COMMIT}:src/api.js`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const mod = { exports: {} };
    const filename = path.join(ROOT, "src/api.js");
    const localRequire = createRequire(filename);
    const sandbox = {
      module: mod,
      exports: mod.exports,
      require: localRequire,
      __filename: filename,
      __dirname: path.dirname(filename),
      process,
      Buffer,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      URL,
      URLSearchParams,
      AbortSignal,
      fetch: (...args) => global.fetch(...args),
    };
    vm.runInNewContext(source, sandbox, { filename: `${BASELINE_COMMIT}:src/api.js` });
    return mod.exports;
  } catch {
    return null;
  }
}

function normalizeCookies(rawSetCookie) {
  const arr = Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [rawSetCookie] : [];
  return arr.map((cookie) =>
    cookie
      .replace(/(redbot_oauth_state=)[^;]+/, "$1<STATE>")
      .replace(/(redbot_session=)[^;]+/, "$1<SESSION>")
  );
}

function normalizeLocation(loc) {
  if (!loc) return null;
  return String(loc)
    .replace(/state=dash_[a-f0-9]+/g, "state=dash_<STATE>")
    .replace(/state=[a-f0-9]+/g, "state=<STATE>")
    .replace(/#session=[^&]+/g, "#session=<SESSION>");
}

function normalizeJsonBody(body, routeKey) {
  if (!body || typeof body !== "object") return body;
  if (routeKey === "health") {
    return {
      ...body,
      processUptime: typeof body.processUptime,
      processUptimeFormatted: typeof body.processUptimeFormatted,
      memory: Object.fromEntries(Object.keys(body.memory || {}).map((k) => [k, typeof body.memory[k]])),
      timestamp: /^\d{4}-\d{2}-\d{2}T/.test(String(body.timestamp)) ? "<ISO>" : body.timestamp,
    };
  }
  return body;
}

function normalizeHtmlBody(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function extractCookieValue(setCookieHeader, cookieName) {
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  for (const raw of arr) {
    const prefix = `${cookieName}=`;
    const part = raw.split(";")[0]?.trim();
    if (part && part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

function snapshotResponse(res, { key = null } = {}) {
  const trackedHeaderNames = [
    "content-type",
    "cache-control",
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "access-control-max-age",
    "vary",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "retry-after",
    "x-content-type-options",
    "referrer-policy",
  ];
  const headers = {};
  for (const name of trackedHeaderNames) {
    if (res.headers[name] !== undefined) headers[name] = res.headers[name];
  }
  if (res.headers.location !== undefined) headers.location = normalizeLocation(res.headers.location);
  if (res.headers["set-cookie"] !== undefined) headers["set-cookie"] = normalizeCookies(res.headers["set-cookie"]);

  const contentType = String(res.headers["content-type"] || "");
  const body = contentType.includes("application/json")
    ? normalizeJsonBody(res.json, key)
    : contentType.includes("text/html")
      ? normalizeHtmlBody(res.text)
      : res.text;

  return { status: res.status, headers, body };
}

function installApiMocks() {
  const { GuildConfig, Ticket, UserConfig } = require(path.join(ROOT, "src/database"));
  const { invalidateGuildConfigCache } = require(path.join(ROOT, "src/guild"));

  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origTicketCount = Ticket.countDocuments;
  const origGuildFindOne = GuildConfig.findOne;
  const origGuildFindOneAndUpdate = GuildConfig.findOneAndUpdate;
  const origUserFindOne = UserConfig.findOne;
  const origUserFindOneAndUpdate = UserConfig.findOneAndUpdate;
  const origFetch = global.fetch;

  const envKeys = [
    "CLIENT_ID",
    "CLIENT_SECRET",
    "SESSION_SECRET",
    "API_KEY",
    "TOKEN",
    "OAUTH_REDIRECT_URI",
    "OAUTH_SUCCESS_URL",
    "OAUTH_REQUIRE_STATE",
    "DASHBOARD_URL",
  ];
  const savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));

  const guildStore = new Map();
  const userStore = new Map();

  const makeQuery = (resolver) => ({
    select() { return this; },
    async lean() { return resolver(); },
  });

  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });

  Ticket.countDocuments = async ({ guildId, status }) => {
    if (guildId !== GUILD_ALLOWED) return 0;
    return status === "open" ? 3 : 7;
  };

  GuildConfig.findOne = (filter) => makeQuery(() => guildStore.get(filter?.guildId) ?? null);
  GuildConfig.findOneAndUpdate = (filter, update) =>
    makeQuery(() => {
      const gid = filter?.guildId;
      const prev = guildStore.get(gid) || { guildId: gid, lang: "es", ticketConfig: {} };
      const next = structuredClone(prev);
      for (const [k, v] of Object.entries(update?.$set || {})) {
        if (k.startsWith("ticketConfig.")) {
          next.ticketConfig = next.ticketConfig || {};
          next.ticketConfig[k.slice("ticketConfig.".length)] = v;
        } else {
          next[k] = v;
        }
      }
      guildStore.set(gid, next);
      return next;
    });

  UserConfig.findOne = (filter) => makeQuery(() => userStore.get(filter?.userId) ?? null);
  UserConfig.findOneAndUpdate = (filter, update) =>
    makeQuery(() => {
      const uid = filter?.userId;
      const prev = userStore.get(uid) || { userId: uid };
      const next = { ...prev, ...(update?.$set || {}) };
      userStore.set(uid, next);
      return next;
    });

  global.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/oauth2/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "mock_access_8b", guild: { id: GUILD_ALLOWED } }),
      };
    }
    if (target.endsWith("/users/@me")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: USER_ID,
          username: "Tester",
          global_name: "Tester",
          avatar: "abc",
          locale: "en-US",
        }),
      };
    }
    if (target.endsWith("/users/@me/guilds")) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          { id: GUILD_ALLOWED, name: "TestGuild", icon: null, owner: false, permissions: String(1n << 5n) },
          { id: GUILD_FORBIDDEN, name: "OtherGuild", icon: null, owner: false, permissions: "0" },
        ],
      };
    }
    throw new Error(`Fetch inesperado en test-api: ${target}`);
  };

  const categoryCh = { id: CAT_ID, name: "Tickets", type: ChannelType.GuildCategory };
  const textCh = {
    id: TEXT_CH_ID,
    name: "soporte",
    type: ChannelType.GuildText,
    parentId: CAT_ID,
    isTextBased: () => true,
    send: async () => ({ id: "777777777777777777" }),
    messages: { fetch: async () => null },
  };
  const roleMain = { id: ROLE_ID, name: "Soporte", position: 5, managed: false, hexColor: "#ff383d" };
  const roleEveryone = { id: GUILD_ALLOWED, name: "@everyone", position: 0, managed: false, hexColor: "#000000" };

  const makeMockMember = (id, perms = []) => {
    const set = new Set(perms);
    return {
      id,
      permissions: {
        has: (reqPerms) => {
          const list = Array.isArray(reqPerms) ? reqPerms : [reqPerms];
          return list.every((p) => set.has(p));
        },
      },
    };
  };

  const defaultAllowedMember = makeMockMember(USER_ID, ["ManageGuild"]);
  const guildAllowed = {
    id: GUILD_ALLOWED,
    name: "TestGuild",
    ownerId: "999111222333444555",
    memberCount: 50,
    iconURL: () => "https://cdn.example/guild.png",
    channels: { cache: new Map([[CAT_ID, categoryCh], [TEXT_CH_ID, textCh]]) },
    roles: { cache: new Map([[GUILD_ALLOWED, roleEveryone], [ROLE_ID, roleMain]]) },
    emojis: { cache: new Map() },
    stickers: { cache: new Map() },
    members: {
      cache: new Map([[USER_ID, defaultAllowedMember]]),
      fetch: async () => defaultAllowedMember,
    },
  };
  const guildForbidden = {
    id: GUILD_FORBIDDEN,
    name: "OtherGuild",
    ownerId: "999111222333444556",
    memberCount: 12,
    iconURL: () => null,
    channels: { cache: new Map() },
    roles: { cache: new Map() },
    emojis: { cache: new Map() },
    stickers: { cache: new Map() },
    members: {
      cache: new Map(),
      fetch: async () => makeMockMember(USER_ID, []),
    },
  };

  const mockClient = {
    readyAt: new Date("2026-01-01T00:00:00.000Z"),
    uptime: 65000,
    ws: { status: 0, ping: 42 },
    user: {
      id: TEST_CLIENT_ID,
      username: "RedBot",
      globalName: "RedBot",
      discriminator: "0",
      displayAvatarURL: () => "https://cdn.example/avatar.png",
      avatarDecorationURL: () => null,
      bannerURL: () => null,
      accentColor: 16726077,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      createdTimestamp: 1704067200000,
      flags: { has: (f) => f === "VerifiedBot" },
    },
    guilds: { cache: new Map([[GUILD_ALLOWED, guildAllowed], [GUILD_FORBIDDEN, guildForbidden]]) },
    channels: { cache: new Map([[CAT_ID, categoryCh], [TEXT_CH_ID, textCh]]) },
  };

  const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

  const resetStores = () => {
    guildStore.clear();
    userStore.clear();
    invalidateGuildConfigCache();
    guildAllowed.members.cache = new Map([[USER_ID, defaultAllowedMember]]);
    guildAllowed.members.fetch = async () => defaultAllowedMember;
  };

  const setTestEnv = (vals = {}) => {
    for (const k of envKeys) {
      if (Object.prototype.hasOwnProperty.call(vals, k) && vals[k] !== undefined) process.env[k] = vals[k];
      else delete process.env[k];
    }
  };

  const restore = () => {
    resetStores();
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    Ticket.countDocuments = origTicketCount;
    GuildConfig.findOne = origGuildFindOne;
    GuildConfig.findOneAndUpdate = origGuildFindOneAndUpdate;
    UserConfig.findOne = origUserFindOne;
    UserConfig.findOneAndUpdate = origUserFindOneAndUpdate;
    global.fetch = origFetch;
  };

  return { mockClient, silentLogger, resetStores, setTestEnv, restore, makeMockMember };
}

function isRedirectTo(loc, prefix) {
  return typeof loc === "string" && loc.startsWith(prefix);
}

async function runHttpContractSuite(apiMod, envCtrl) {
  const { mockClient, silentLogger, resetStores, setTestEnv } = envCtrl;
  const snapshots = {};
  const bearerHeader = { Authorization: `Bearer ${TEST_API_KEY}` };

  const baseConfig = (port, overrides = {}) => ({
    API_PORT: port,
    API_HOST: "127.0.0.1",
    API_CORS_ORIGIN: "https://redbot.me",
    API_KEY: TEST_API_KEY,
    CLIENT_ID: TEST_CLIENT_ID,
    CLIENT_SECRET: TEST_CLIENT_SECRET,
    SESSION_SECRET: TEST_SESSION_SECRET,
    OAUTH_REDIRECT_URI: "http://127.0.0.1/api/oauth/callback",
    DASHBOARD_URL: "https://redbot.me/tickets",
    ...overrides,
  });

  // Fase 1: Endpoints generales, orden CORS -> 405 -> Rate -> Auth -> Routing, OAuth, Sesión, Tickets, Logout
  resetStores();
  setTestEnv({});
  const port1 = await getFreePort();
  await apiMod.startApi(mockClient, baseConfig(port1, { TRUST_PROXY: true }), silentLogger);

  try {
    const rOptions = await httpRequest(port1, { method: "OPTIONS", path: "/api/stats" });
    assertCondition(rOptions.status === 204, `OPTIONS /api/stats esperado 204, obtuvo ${rOptions.status}`);
    assertCondition(rOptions.headers["access-control-allow-origin"] === "https://redbot.me", "CORS origin incorrecto");
    assertCondition(rOptions.headers["x-ratelimit-limit"] === undefined, "OPTIONS no debe consumir rate limit");
    snapshots.optionsStats = snapshotResponse(rOptions);

    const r405Stats = await httpRequest(port1, { method: "POST", path: "/api/stats" });
    assertCondition(r405Stats.status === 405 && r405Stats.headers["x-ratelimit-limit"] === undefined, "POST /api/stats debe dar 405 antes de rate limit/auth");
    snapshots.postStats405 = snapshotResponse(r405Stats);

    const r405Ticket = await httpRequest(port1, { method: "DELETE", path: `/api/tickets/${GUILD_ALLOWED}` });
    assertCondition(r405Ticket.status === 405, `DELETE ticket esperado 405, obtuvo ${r405Ticket.status}`);
    snapshots.deleteTicket405 = snapshotResponse(r405Ticket);

    const r405Logout = await httpRequest(port1, { method: "PUT", path: "/auth/logout" });
    assertCondition(r405Logout.status === 405, `PUT /auth/logout esperado 405, obtuvo ${r405Logout.status}`);
    snapshots.putLogout405 = snapshotResponse(r405Logout);

    const r401Bot = await httpRequest(port1, { path: "/api/bot" });
    assertCondition(r401Bot.status === 401 && r401Bot.headers["x-ratelimit-remaining"] === "29", "GET /api/bot sin auth debe dar 401 con remaining=29");
    snapshots.unauthBot401 = snapshotResponse(r401Bot);

    const r401Unknown = await httpRequest(port1, { path: "/api/does-not-exist" });
    assertCondition(r401Unknown.status === 401 && r401Unknown.headers["x-ratelimit-remaining"] === "28", "Auth debe preceder a 404");
    snapshots.unauthUnknown401 = snapshotResponse(r401Unknown);

    const rStats = await httpRequest(port1, { path: "/api/stats" });
    assertCondition(rStats.status === 200 && rStats.headers["cache-control"] === "public, max-age=15", "/api/stats esperado 200 public");
    assertCondition(rStats.json?.guilds === 2 && rStats.json?.users === 62, "/api/stats métricas incorrectas");
    snapshots.getStatsPublic = snapshotResponse(rStats);

    const rCommands = await httpRequest(port1, { path: "/api/commands" });
    assertCondition(rCommands.status === 200 && rCommands.json?.total === 128, "/api/commands esperado 128");
    snapshots.getCommandsPublic = snapshotResponse(rCommands);

    const rRoot = await httpRequest(port1, { path: "/", headers: bearerHeader });
    assertCondition(rRoot.status === 200 && rRoot.json?.name === "RedBot API", "/ esperado 200");
    snapshots.getRoot = snapshotResponse(rRoot);

    const rApiRoot = await httpRequest(port1, { path: "/api", headers: bearerHeader });
    assertCondition(rApiRoot.status === 200 && rApiRoot.json?.endpoints?.length === 13, "/api esperado 200");
    snapshots.getApiRoot = snapshotResponse(rApiRoot);

    const rBot = await httpRequest(port1, { path: "/api/bot", headers: bearerHeader });
    assertCondition(rBot.status === 200 && rBot.json?.id === TEST_CLIENT_ID, "/api/bot esperado 200");
    snapshots.getBot = snapshotResponse(rBot);

    const rHealth = await httpRequest(port1, { path: "/api/health", headers: bearerHeader });
    assertCondition(rHealth.status === 200 && rHealth.json?.status === "operational", "/api/health esperado 200 operational");
    snapshots.getHealth = snapshotResponse(rHealth, { key: "health" });

    const r404 = await httpRequest(port1, { path: "/api/noexiste", headers: bearerHeader });
    assertCondition(r404.status === 404 && Array.isArray(r404.json?.endpoints), "/api/noexiste esperado 404");
    snapshots.getNotFound404 = snapshotResponse(r404);

    // Invitación OAuth & Dashboard Login
    const rInvite = await httpRequest(port1, { path: `/invite?guild_id=${GUILD_ALLOWED}` });
    assertCondition(rInvite.status === 302 && isRedirectTo(rInvite.headers.location, "https://discord.com/oauth2/authorize?"), "/invite esperado 302");
    const inviteState = extractCookieValue(rInvite.headers["set-cookie"], "redbot_oauth_state");
    assertCondition(Boolean(inviteState), "Falta cookie redbot_oauth_state en /invite");
    snapshots.getInvite = snapshotResponse(rInvite);

    const rApiInvite = await httpRequest(port1, { path: "/api/invite" });
    assertCondition(rApiInvite.status === 302, "/api/invite esperado 302");
    snapshots.getApiInvite = snapshotResponse(rApiInvite);

    const rAuthLogin = await httpRequest(port1, { path: "/auth/login?return_to=http://localhost:4321/tickets" });
    assertCondition(rAuthLogin.status === 302, "/auth/login esperado 302");
    snapshots.getAuthLogin = snapshotResponse(rAuthLogin);

    const rApiAuthLogin = await httpRequest(port1, { path: "/api/auth/login?return_to=http://127.0.0.1:4321/tickets" });
    assertCondition(rApiAuthLogin.status === 302, "/api/auth/login esperado 302");
    const dashState = extractCookieValue(rApiAuthLogin.headers["set-cookie"], "redbot_oauth_state");
    assertCondition(dashState?.startsWith("dash_"), "Estado dashboard debe empezar con dash_");
    snapshots.getApiAuthLogin = snapshotResponse(rApiAuthLogin);

    // Callback OAuth errores & cancelación
    const rCbCancel = await httpRequest(port1, { path: "/oauth/callback?error=access_denied" });
    assertCondition(rCbCancel.status === 200, "OAuth error cancelación esperado 200 HTML");
    snapshots.cbCancel = snapshotResponse(rCbCancel);

    const rCbNoCode = await httpRequest(port1, { path: "/api/oauth/callback" });
    assertCondition(rCbNoCode.status === 400, "OAuth sin code esperado 400 HTML");
    snapshots.cbNoCode = snapshotResponse(rCbNoCode);

    const rCbBadState = await httpRequest(port1, { path: "/api/oauth/callback?code=abc&state=dash_wrong" });
    assertCondition(rCbBadState.status === 403, "OAuth state inválido esperado 403 HTML");
    snapshots.cbBadState = snapshotResponse(rCbBadState);

    // Callback invitación válido
    const rCbInviteOk = await httpRequest(port1, {
      path: `/oauth/callback?code=invcode&state=${encodeURIComponent(inviteState)}&guild_id=${GUILD_ALLOWED}`,
      headers: { Cookie: `redbot_oauth_state=${inviteState}` },
    });
    assertCondition(rCbInviteOk.status === 200 && rCbInviteOk.text.includes("RedBot has been added"), "Callback invite OK esperado 200");
    snapshots.cbInviteOk = snapshotResponse(rCbInviteOk);

    // Callback dashboard válido
    const rCbDashOk = await httpRequest(port1, {
      path: `/api/oauth/callback?code=dashcode&state=${encodeURIComponent(dashState)}`,
      headers: { Cookie: `redbot_oauth_state=${dashState}` },
    });
    assertCondition(
      rCbDashOk.status === 302 && isRedirectTo(rCbDashOk.headers.location, "http://127.0.0.1:4321/tickets#session="),
      "Callback dashboard OK esperado 302 con #session="
    );
    const sessionToken = extractCookieValue(rCbDashOk.headers["set-cookie"], "redbot_session");
    assertCondition(Boolean(sessionToken), "Falta cookie redbot_session en callback dashboard");
    snapshots.cbDashOk = snapshotResponse(rCbDashOk);

    const sessionCookieHeader = { Cookie: `redbot_session=${encodeURIComponent(sessionToken)}` };

    const rMe = await httpRequest(port1, { path: "/api/auth/me", headers: sessionCookieHeader });
    assertCondition(rMe.status === 200 && rMe.json?.authenticated === true && rMe.headers["cache-control"] === "no-store", "/api/auth/me esperado 200");
    snapshots.authMe = snapshotResponse(rMe);

    const rDashGuilds = await httpRequest(port1, {
      path: "/api/dashboard/guilds",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assertCondition(rDashGuilds.status === 200 && Array.isArray(rDashGuilds.json?.guilds), "/api/dashboard/guilds esperado 200");
    snapshots.dashboardGuilds = snapshotResponse(rDashGuilds);

    // Rutas de tickets usando SOLO la sesión emitida (sin API_KEY) -> Condición 2a
    const tktIpHeader = { "X-Forwarded-For": "10.0.0.2" };
    const tktSessionHeaders = { ...sessionCookieHeader, ...tktIpHeader };

    const rTktUnauth = await httpRequest(port1, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: tktIpHeader });
    assertCondition(rTktUnauth.status === 401, "Tickets sin sesión esperado 401");
    snapshots.ticketsUnauth = snapshotResponse(rTktUnauth);

    const rTktForbidden = await httpRequest(port1, { path: `/api/tickets/${GUILD_FORBIDDEN}`, headers: tktSessionHeaders });
    assertCondition(rTktForbidden.status === 403, "Tickets guild sin ManageGuild esperado 403");
    snapshots.ticketsForbidden = snapshotResponse(rTktForbidden);

    const rTktMissing = await httpRequest(port1, { path: `/api/tickets/${GUILD_MISSING}`, headers: { ...bearerHeader, ...tktIpHeader } });
    assertCondition(rTktMissing.status === 404, "Tickets guild inexistente esperado 404");
    snapshots.ticketsMissing = snapshotResponse(rTktMissing);

    const rTktGet = await httpRequest(port1, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: tktSessionHeaders });
    assertCondition(rTktGet.status === 200 && rTktGet.json?.stats?.open === 3 && rTktGet.json?.stats?.closed === 7, "GET tickets overview esperado 200");
    snapshots.ticketsGet = snapshotResponse(rTktGet);

    const rTktBadJson = await httpRequest(port1, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ALLOWED}/config`,
      headers: { ...tktSessionHeaders, "Content-Type": "application/json" },
      body: "{bad json",
    });
    assertCondition(rTktBadJson.status === 400, "PUT config JSON inválido esperado 400");
    snapshots.ticketsPutBadJson = snapshotResponse(rTktBadJson);

    const rTktBadChannel = await httpRequest(port1, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ALLOWED}/config`,
      headers: tktSessionHeaders,
      body: { logChannelId: "000000000000000000" },
    });
    assertCondition(rTktBadChannel.status === 400, "PUT config logChannelId inválido esperado 400");
    snapshots.ticketsPutBadChannel = snapshotResponse(rTktBadChannel);

    const rTktPutOk = await httpRequest(port1, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ALLOWED}/config`,
      headers: tktSessionHeaders,
      body: { enabled: true, categoryId: CAT_ID, logChannelId: TEXT_CH_ID, supportRoleId: ROLE_ID },
    });
    assertCondition(rTktPutOk.status === 200 && rTktPutOk.json?.ok === true && rTktPutOk.json?.ticketConfig?.enabled === true, "PUT config esperado 200");
    snapshots.ticketsPutOk = snapshotResponse(rTktPutOk);

    const rTktPanelBad = await httpRequest(port1, {
      method: "POST",
      path: `/api/tickets/${GUILD_ALLOWED}/panel`,
      headers: tktSessionHeaders,
      body: { channelId: "000" },
    });
    assertCondition(rTktPanelBad.status === 400, "POST panel channelId inválido esperado 400");
    snapshots.ticketsPanelBad = snapshotResponse(rTktPanelBad);

    const rTktPanelOk = await httpRequest(port1, {
      method: "POST",
      path: `/api/tickets/${GUILD_ALLOWED}/panel`,
      headers: tktSessionHeaders,
      body: { channelId: TEXT_CH_ID, title: "Soporte", description: "Abre un ticket" },
    });
    assertCondition(rTktPanelOk.status === 200 && rTktPanelOk.json?.messageId === "777777777777777777", "POST panel esperado 200");
    snapshots.ticketsPanelOk = snapshotResponse(rTktPanelOk);

    // Logout por POST + revocación inmediata vista por handleTicketsRoute
    const rLogoutPostPrimary = await httpRequest(port1, { method: "POST", path: "/auth/logout", headers: tktSessionHeaders });
    assertCondition(
      rLogoutPostPrimary.status === 200 && rLogoutPostPrimary.json?.ok === true &&
        normalizeCookies(rLogoutPostPrimary.headers["set-cookie"])[0]?.includes("Max-Age=0"),
      "POST /auth/logout esperado 200 con Max-Age=0"
    );
    snapshots.logoutPostPrimary = snapshotResponse(rLogoutPostPrimary);

    const rRevokedTickets = await httpRequest(port1, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: tktSessionHeaders });
    assertCondition(rRevokedTickets.status === 401, "Token revocado tras logout debe dar 401 en tickets");
    snapshots.revokedTickets401 = snapshotResponse(rRevokedTickets);

    const rLogoutPost = await httpRequest(port1, { method: "POST", path: "/api/auth/logout", headers: tktIpHeader });
    assertCondition(rLogoutPost.status === 200 && rLogoutPost.json?.ok === true, "POST /api/auth/logout esperado 200");
    snapshots.logoutPost = snapshotResponse(rLogoutPost);
  } finally {
    await apiMod.stopApi();
  }

  // Fase 2: Rate limit compartido entre rutas + orden exacto CORS -> 405 -> 429 -> 401
  const port2 = await getFreePort();
  await apiMod.startApi(mockClient, baseConfig(port2), silentLogger);
  try {
    const cycle = [
      { path: "/api/stats", headers: {} },
      { path: "/api/commands", headers: {} },
      { path: "/api/bot", headers: bearerHeader },
      { path: "/api/health", headers: bearerHeader },
      { path: `/api/tickets/${GUILD_ALLOWED}`, headers: bearerHeader },
      { path: "/api/auth/me", headers: {} },
    ];
    for (let i = 0; i < 30; i++) {
      const target = cycle[i % cycle.length];
      const res = await httpRequest(port2, target);
      const expectedRemaining = String(29 - i);
      assertCondition(
        res.headers["x-ratelimit-limit"] === "30" && res.headers["x-ratelimit-remaining"] === expectedRemaining,
        `Rate limit desfasado en petición #${i + 1} (${target.path}): remaining=${res.headers["x-ratelimit-remaining"]} esperado=${expectedRemaining}`
      );
    }

    const r429 = await httpRequest(port2, { path: "/api/bot" }); // sin auth -> debe salir 429 antes de 401
    assertCondition(
      r429.status === 429 && r429.headers["retry-after"] === "60" && r429.headers["x-ratelimit-remaining"] === "0",
      `Se esperaba 429 en petición #31 antes de 401, obtuvo ${r429.status}`
    );
    snapshots.rateLimit429 = snapshotResponse(r429);

    const rOptUnderLimit = await httpRequest(port2, { method: "OPTIONS", path: "/api/stats" });
    assertCondition(rOptUnderLimit.status === 204, "OPTIONS debe preceder a 429");

    const r405UnderLimit = await httpRequest(port2, { method: "DELETE", path: "/api/stats" });
    assertCondition(r405UnderLimit.status === 405, "405 debe preceder a 429");
  } finally {
    await apiMod.stopApi();
  }

  // Fase 3: 503 sin configuración OAuth + verificación estricta de handles cerrados en stopApi()
  const resourcesBefore = countResourceTypes();
  const port3 = await getFreePort();
  const noOauthClient = { ...mockClient, user: null };
  setTestEnv({});
  await apiMod.startApi(noOauthClient, { API_PORT: port3, API_HOST: "127.0.0.1" }, silentLogger);

  try {
    const rInv503 = await httpRequest(port3, { path: "/invite" });
    assertCondition(rInv503.status === 503, `/invite sin CLIENT_ID esperado 503, obtuvo ${rInv503.status}`);
    snapshots.invite503 = snapshotResponse(rInv503);

    const rLogin503 = await httpRequest(port3, { path: "/auth/login" });
    assertCondition(rLogin503.status === 503, `/auth/login sin OAuth esperado 503, obtuvo ${rLogin503.status}`);
    snapshots.login503 = snapshotResponse(rLogin503);
  } finally {
    await apiMod.stopApi();
  }

  // Confirmar que el puerto quedó cerrado y no quedaron TCPServerWrap / Timeout colgados
  let refused = false;
  try {
    await httpRequest(port3, { path: "/api/stats" });
  } catch (err) {
    refused = Boolean(err && ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(err.code));
  }
  assertCondition(refused, "stopApi() no cerró el socket de escucha");

  const resourcesAfter = countResourceTypes();
  assertCondition(
    resourcesAfter.TCPServerWrap <= resourcesBefore.TCPServerWrap,
    `Posible fuga de TCPServerWrap tras stopApi(): antes=${resourcesBefore.TCPServerWrap}, después=${resourcesAfter.TCPServerWrap}`
  );
  assertCondition(
    resourcesAfter.Timeout <= resourcesBefore.Timeout,
    `Posible fuga de Timeout/interval tras stopApi(): antes=${resourcesBefore.Timeout}, después=${resourcesAfter.Timeout}`
  );

  return { snapshots, resourcesBefore, resourcesAfter };
}

function checkSingletonDeclarations() {
  const apiDir = path.join(ROOT, "src/api");
  const isSplit = fs.existsSync(apiDir);
  const filesToScan = isSplit
    ? fs.readdirSync(apiDir).filter((f) => f.endsWith(".js")).map((f) => path.join(apiDir, f)).concat(path.join(ROOT, "src/api.js"))
    : [path.join(ROOT, "src/api.js")];

  const singletons = [
    "EPHEMERAL_SESSION_SECRET",
    "rateStore",
    "oauthStates",
    "dashboardSessions",
    "revokedSessions",
    ...(isSplit ? ["memberPermCache"] : []),
  ];
  const counts = {};
  for (const name of singletons) {
    const re = new RegExp(`\\bconst\\s+${name}\\s*=`, "g");
    let found = 0;
    for (const file of filesToScan) {
      const src = fs.readFileSync(file, "utf8");
      found += (src.match(re) || []).length;
    }
    assertCondition(found === 1, `Estado compartido duplicado o ausente (${name}): ${found} declaraciones`);
    counts[name] = found;
  }
  return { isSplit, counts };
}

async function verifySplitModuleSingletons(envCtrl) {
  const apiDir = path.join(ROOT, "src/api");
  if (!fs.existsSync(path.join(apiDir, "context.js"))) return { tested: false };

  const contextMod = require(path.join(ROOT, "src/api/context"));
  const sessionMod = require(path.join(ROOT, "src/api/session"));
  const httpMod = require(path.join(ROOT, "src/api/http"));
  const apiIndex = require(path.join(ROOT, "src/api"));

  assertCondition(apiIndex === require(path.join(ROOT, "src/api/index")), "src/api.js debe reexportar exactamente src/api/index");
  assertCondition(httpMod.rateStore === contextMod.rateStore || contextMod.rateStore instanceof Map, "rateStore debe vivir en context.js");

  const { mockClient, silentLogger, resetStores, setTestEnv } = envCtrl;
  resetStores();
  setTestEnv({});

  const port = await getFreePort();
  await apiIndex.startApi(mockClient, { API_PORT: port, API_HOST: "127.0.0.1" }, silentLogger);

  try {
    // Condición 2c: secreto efímero único y verificable entre módulos
    const s1 = sessionMod.getSessionSecret();
    const s2 = sessionMod.getSessionSecret();
    assertCondition(
      s1 === contextMod.EPHEMERAL_SESSION_SECRET && s2 === contextMod.EPHEMERAL_SESSION_SECRET,
      "getSessionSecret() no devolvió el mismo EPHEMERAL_SESSION_SECRET de context.js"
    );

    const token = sessionMod.createDashboardSession({
      user: { id: USER_ID, username: "Tester", globalName: "Tester", avatar: null },
      guilds: [{ id: GUILD_ALLOWED, name: "TestGuild", icon: null, owner: false, permissions: String(1n << 5n) }],
    });
    assertCondition(
      Boolean(sessionMod.verifyDashboardSessionToken(token)),
      "Token firmado con EPHEMERAL_SESSION_SECRET no verificó en session.js"
    );

    // Sesión creada directamente en session.js es vista por oauth/me y por handleTicketsRoute
    const rMe = await httpRequest(port, {
      path: "/api/auth/me",
      headers: { Authorization: `Bearer ${token}` },
    });
    assertCondition(rMe.status === 200 && rMe.json?.user?.id === USER_ID, "Sesión de session.js no fue reconocida en /api/auth/me");

    const rTkt = await httpRequest(port, {
      path: `/api/tickets/${GUILD_ALLOWED}`,
      headers: { Cookie: `redbot_session=${encodeURIComponent(token)}` },
    });
    assertCondition(rTkt.status === 200 && rTkt.json?.guild?.id === GUILD_ALLOWED, "Sesión de session.js no fue reconocida en handleTicketsRoute");

    const rLogout = await httpRequest(port, {
      method: "POST",
      path: "/api/auth/logout",
      headers: { Cookie: `redbot_session=${encodeURIComponent(token)}` },
    });
    assertCondition(rLogout.status === 200, "Logout tras sesión efímera falló");

    const rTktAfter = await httpRequest(port, {
      path: `/api/tickets/${GUILD_ALLOWED}`,
      headers: { Cookie: `redbot_session=${encodeURIComponent(token)}` },
    });
    assertCondition(rTktAfter.status === 401, "Revocación en oauth/logout no invalidó handleTicketsRoute");
  } finally {
    await apiIndex.stopApi();
  }

  return { tested: true };
}

async function verifyB3LogoutPostOnly(currentApi, baselineApi, envCtrl) {
  const { mockClient, silentLogger, resetStores, setTestEnv } = envCtrl;
  resetStores();
  setTestEnv({});

  const configBase = {
    API_HOST: "127.0.0.1",
    TRUST_PROXY: true,
    API_KEY: TEST_API_KEY,
    CLIENT_ID: TEST_CLIENT_ID,
    CLIENT_SECRET: TEST_CLIENT_SECRET,
    SESSION_SECRET: TEST_SESSION_SECRET,
    OAUTH_REDIRECT_URI: "http://127.0.0.1/api/oauth/callback",
    DASHBOARD_URL: "https://redbot.me/tickets",
  };

  const port = await getFreePort();
  await currentApi.startApi(mockClient, { ...configBase, API_PORT: port }, silentLogger);

  try {
    const rLogin = await httpRequest(port, { path: "/api/auth/login?return_to=http://127.0.0.1:4321/tickets" });
    const dashState = extractCookieValue(rLogin.headers["set-cookie"], "redbot_oauth_state");
    assertCondition(Boolean(dashState), "B3 #2: falta cookie redbot_oauth_state en login");

    const rCb = await httpRequest(port, {
      path: `/api/oauth/callback?code=dashcode&state=${encodeURIComponent(dashState)}`,
      headers: { Cookie: `redbot_oauth_state=${dashState}` },
    });
    const sessionToken = extractCookieValue(rCb.headers["set-cookie"], "redbot_session");
    assertCondition(Boolean(sessionToken), "B3 #2: falta cookie redbot_session en callback");

    const sessionHeaders = { Cookie: `redbot_session=${encodeURIComponent(sessionToken)}` };

    const rGetLegacy = await httpRequest(port, { method: "GET", path: "/auth/logout", headers: sessionHeaders });
    assertCondition(
      rGetLegacy.status === 405 &&
        rGetLegacy.json?.error === "Method not allowed" &&
        rGetLegacy.headers["set-cookie"] === undefined &&
        rGetLegacy.headers["x-ratelimit-limit"] === undefined,
      `B3 #2: GET /auth/logout esperado 405 sin Set-Cookie, obtuvo ${rGetLegacy.status}`
    );

    const rGetApi = await httpRequest(port, { method: "GET", path: "/api/auth/logout", headers: sessionHeaders });
    assertCondition(
      rGetApi.status === 405 &&
        rGetApi.json?.error === "Method not allowed" &&
        rGetApi.headers["set-cookie"] === undefined,
      `B3 #2: GET /api/auth/logout esperado 405 sin Set-Cookie, obtuvo ${rGetApi.status}`
    );

    const rStillAuth = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: sessionHeaders });
    assertCondition(rStillAuth.status === 200, `B3 #2: GET logout bloqueado no debe revocar sesión (${rStillAuth.status})`);

    const rPostApi = await httpRequest(port, { method: "POST", path: "/api/auth/logout", headers: sessionHeaders });
    assertCondition(
      rPostApi.status === 200 &&
        rPostApi.json?.ok === true &&
        normalizeCookies(rPostApi.headers["set-cookie"])[0]?.includes("Max-Age=0"),
      `B3 #2: POST /api/auth/logout esperado 200 con Max-Age=0, obtuvo ${rPostApi.status}`
    );

    const rAfterRevoke = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: sessionHeaders });
    assertCondition(rAfterRevoke.status === 401, `B3 #2: tras POST logout la sesión debe devolver 401, obtuvo ${rAfterRevoke.status}`);
  } finally {
    await currentApi.stopApi();
  }

  let baselineGetStatus = null;
  if (baselineApi) {
    const portBase = await getFreePort();
    await baselineApi.startApi(mockClient, { ...configBase, API_PORT: portBase }, silentLogger);
    try {
      const rBaseGet = await httpRequest(portBase, { method: "GET", path: "/auth/logout" });
      baselineGetStatus = rBaseGet.status;
      assertCondition(baselineGetStatus === 200, `Baseline ${BASELINE_COMMIT} debía aceptar GET /auth/logout con 200, obtuvo ${baselineGetStatus}`);
    } finally {
      await baselineApi.stopApi();
    }
  }

  return { baselineGetStatus };
}

async function verifyB3CanManageGuildLive(currentApi, baselineApi, envCtrl) {
  const { mockClient, silentLogger, resetStores, setTestEnv, makeMockMember } = envCtrl;
  const contextMod = require(path.join(ROOT, "src/api/context"));
  const sessionMod = require(path.join(ROOT, "src/api/session"));

  resetStores();
  setTestEnv({});

  const configBase = {
    API_HOST: "127.0.0.1",
    TRUST_PROXY: true,
    API_KEY: TEST_API_KEY,
    CLIENT_ID: TEST_CLIENT_ID,
    CLIENT_SECRET: TEST_CLIENT_SECRET,
    SESSION_SECRET: TEST_SESSION_SECRET,
    OAUTH_REDIRECT_URI: "http://127.0.0.1/api/oauth/callback",
    DASHBOARD_URL: "https://redbot.me/tickets",
  };

  const categoryCh = { id: CAT_ID, name: "Tickets", type: ChannelType.GuildCategory };
  const textCh = {
    id: TEXT_CH_ID,
    name: "soporte",
    type: ChannelType.GuildText,
    parentId: CAT_ID,
    isTextBased: () => true,
    send: async () => ({ id: "777777777777777777" }),
    messages: { fetch: async () => null },
  };
  const roleMain = { id: ROLE_ID, name: "Soporte", position: 5, managed: false, hexColor: "#ff383d" };

  let ownerFetchCalled = 0;
  const guildOwner = {
    id: GUILD_OWNER,
    name: "OwnerGuild",
    ownerId: USER_ID,
    memberCount: 20,
    iconURL: () => null,
    channels: { cache: new Map([[CAT_ID, categoryCh], [TEXT_CH_ID, textCh]]) },
    roles: { cache: new Map([[GUILD_OWNER, { id: GUILD_OWNER, name: "@everyone", position: 0 }], [ROLE_ID, roleMain]]) },
    emojis: { cache: new Map() },
    stickers: { cache: new Map() },
    members: {
      cache: new Map(),
      fetch: async () => {
        ownerFetchCalled++;
        throw new Error("No debe hacer fetch si es dueño");
      },
    },
  };

  const guildAllowed = mockClient.guilds.cache.get(GUILD_ALLOWED);
  const origGuildsCache = new Map(mockClient.guilds.cache);
  mockClient.guilds.cache.set(GUILD_OWNER, guildOwner);

  const port = await getFreePort();
  await currentApi.startApi(mockClient, { ...configBase, API_PORT: port }, silentLogger);

  try {
    // Sesión con adminGuildIds que incluye GUILD_ALLOWED, GUILD_OWNER y GUILD_ABSENT (bot ausente)
    const token = sessionMod.createDashboardSession({
      user: { id: USER_ID, username: "Tester", globalName: "Tester", avatar: null },
      guilds: [
        { id: GUILD_ALLOWED, name: "TestGuild", icon: null, owner: false, permissions: String(1n << 5n) },
        { id: GUILD_OWNER, name: "OwnerGuild", icon: null, owner: true, permissions: "0" },
        { id: GUILD_ABSENT, name: "AbsentGuild", icon: null, owner: false, permissions: String(1n << 5n) },
      ],
    });
    const baseAuth = { Cookie: `redbot_session=${encodeURIComponent(token)}` };
    const headersFor = (ip) => ({ ...baseAuth, "X-Forwarded-For": ip });

    let fetchCalls = [];
    let liveMemberResult = makeMockMember(USER_ID, ["ManageGuild"]);
    let fetchError = null;
    guildAllowed.members.cache = new Map([[USER_ID, makeMockMember(USER_ID, ["ManageGuild"])]]);
    guildAllowed.members.fetch = async (arg) => {
      fetchCalls.push(arg);
      if (fetchError) throw fetchError;
      if (liveMemberResult) guildAllowed.members.cache.set(USER_ID, liveMemberResult);
      return liveMemberResult;
    };

    // 1. GET usa cache (0 fetch); si falta cache hace 1 fetch sin force; PUT/POST SIEMPRE usan force:true
    const rGetCached = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: headersFor("10.1.0.1") });
    assertCondition(rGetCached.status === 200 && fetchCalls.length === 0, "B3 #1: GET con caché no debe llamar fetch");

    guildAllowed.members.cache.clear();
    const rGetMiss = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: headersFor("10.1.0.1") });
    assertCondition(
      rGetMiss.status === 200 && fetchCalls.length === 1 && fetchCalls[0] === USER_ID,
      "B3 #1: GET sin caché debe hacer 1 fetch sin force"
    );

    const rPutForce = await httpRequest(port, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ALLOWED}/config`,
      headers: headersFor("10.1.0.1"),
      body: { enabled: true },
    });
    assertCondition(
      rPutForce.status === 200 &&
        fetchCalls.length === 2 &&
        typeof fetchCalls[1] === "object" &&
        fetchCalls[1]?.user === USER_ID &&
        fetchCalls[1]?.force === true,
      "B3 #1: PUT debe forzar members.fetch({ user, force: true })"
    );
    assertCondition(contextMod.memberPermCache.size === 0, "B3 #1: memberPermCache no debe cachear aciertos de permiso");

    // 2. Admin degradado: caché stale en PUT/POST -> 403; luego en GET -> 403; y desaparece del listado
    liveMemberResult = makeMockMember(USER_ID, []);
    guildAllowed.members.cache.set(USER_ID, makeMockMember(USER_ID, ["ManageGuild"])); // caché obsoleta antes de PUT
    const rPutDemoted = await httpRequest(port, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ALLOWED}/config`,
      headers: headersFor("10.1.0.2"),
      body: { enabled: false },
    });
    assertCondition(rPutDemoted.status === 403, `B3 #1: admin degradado en PUT esperado 403, obtuvo ${rPutDemoted.status}`);

    const rPanelDemoted = await httpRequest(port, {
      method: "POST",
      path: `/api/tickets/${GUILD_ALLOWED}/panel`,
      headers: headersFor("10.1.0.2"),
      body: { channelId: TEXT_CH_ID, title: "X" },
    });
    assertCondition(rPanelDemoted.status === 403, `B3 #1: admin degradado en POST panel esperado 403, obtuvo ${rPanelDemoted.status}`);

    const rGetDemoted = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: headersFor("10.1.0.2") });
    assertCondition(rGetDemoted.status === 403, `B3 #1: admin degradado en GET esperado 403, obtuvo ${rGetDemoted.status}`);

    const rListDemoted = await httpRequest(port, { path: "/api/dashboard/guilds", headers: headersFor("10.1.0.2") });
    assertCondition(
      rListDemoted.status === 200 &&
        !rListDemoted.json?.guilds?.some((g) => g.id === GUILD_ALLOWED),
      "B3 #1: admin degradado debe desaparecer de /api/dashboard/guilds"
    );
    const rMeDemoted = await httpRequest(port, { path: "/api/auth/me", headers: headersFor("10.1.0.2") });
    assertCondition(
      rMeDemoted.status === 200 && !rMeDemoted.json?.guilds?.some((g) => g.id === GUILD_ALLOWED),
      "B3 #1: admin degradado debe desaparecer de /api/auth/me"
    );

    // 3. Miembro que sale del servidor (10007 Unknown Member) -> 403 y cacheado 60s solo como ausencia
    guildAllowed.members.cache.clear();
    fetchCalls = [];
    fetchError = Object.assign(new Error("Unknown Member"), { code: 10007 });
    const rLeftGet1 = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: headersFor("10.1.0.3") });
    assertCondition(rLeftGet1.status === 403 && fetchCalls.length === 1, "B3 #1: miembro 10007 esperado 403");
    assertCondition(contextMod.memberPermCache.size === 1, "B3 #1: ausencia 10007 debe cachearse en memberPermCache");

    const rLeftGet2 = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: headersFor("10.1.0.3") });
    assertCondition(rLeftGet2.status === 403 && fetchCalls.length === 1, "B3 #1: ausencia cacheada no debe repetir fetch por 60s");

    const rLeftPut = await httpRequest(port, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ALLOWED}/config`,
      headers: headersFor("10.1.0.3"),
      body: { enabled: true },
    });
    assertCondition(rLeftPut.status === 403 && fetchCalls.length === 1, "B3 #1: ausencia 10007 en PUT esperado 403");

    const rLeftList = await httpRequest(port, { path: "/api/dashboard/guilds", headers: headersFor("10.1.0.3") });
    assertCondition(
      rLeftList.status === 200 && !rLeftList.json?.guilds?.some((g) => g.id === GUILD_ALLOWED),
      "B3 #1: miembro ausente 10007 no debe aparecer en listado"
    );

    // 4. Fallo de Discord (5xx / timeout) -> 503 y SIN cachear el error; recuperación inmediata al restaurar
    contextMod.memberPermCache.clear();
    guildAllowed.members.cache.clear();
    fetchCalls = [];
    fetchError = Object.assign(new Error("Discord 503 Service Unavailable"), { status: 503 });
    const r503Get = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: headersFor("10.1.0.4") });
    assertCondition(
      r503Get.status === 503 && r503Get.headers["cache-control"] === "no-store",
      `B3 #1: fallo Discord 5xx en GET esperado 503 no-store, obtuvo ${r503Get.status}`
    );
    assertCondition(contextMod.memberPermCache.size === 0, "B3 #1: error 5xx no debe cachearse en memberPermCache");

    const r503Put = await httpRequest(port, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ALLOWED}/config`,
      headers: headersFor("10.1.0.4"),
      body: { enabled: true },
    });
    assertCondition(r503Put.status === 503 && contextMod.memberPermCache.size === 0, "B3 #1: fallo 5xx en PUT esperado 503 sin caché");

    const r503List = await httpRequest(port, { path: "/api/dashboard/guilds", headers: headersFor("10.1.0.4") });
    assertCondition(
      r503List.status === 200 && !r503List.json?.guilds?.some((g) => g.id === GUILD_ALLOWED),
      "B3 #1: fallo Discord debe omitir temporalmente la guild no verificable del listado"
    );

    // Timeout / error transitorio en siguiente intento y recuperación inmediata
    fetchError = Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" });
    const rTimeout503 = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: headersFor("10.1.0.4") });
    assertCondition(rTimeout503.status === 503 && contextMod.memberPermCache.size === 0, "B3 #1: timeout esperado 503 sin caché");

    fetchError = null;
    liveMemberResult = makeMockMember(USER_ID, ["Administrator"]); // Administrator sin ManageGuild
    const rRecoveredAdmin = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: headersFor("10.1.0.4") });
    assertCondition(rRecoveredAdmin.status === 200 && contextMod.memberPermCache.size === 0, "B3 #1: recuperación inmediata con Administrator debe dar 200");

    // 5. Administrator sin ManageGuild permitido en lectura, escritura y listado
    const rAdminWrite = await httpRequest(port, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ALLOWED}/config`,
      headers: headersFor("10.1.0.5"),
      body: { enabled: true },
    });
    assertCondition(rAdminWrite.status === 200, `B3 #1: Administrator sin ManageGuild en PUT esperado 200, obtuvo ${rAdminWrite.status}`);

    const rAdminList = await httpRequest(port, { path: "/api/dashboard/guilds", headers: headersFor("10.1.0.5") });
    const adminEntry = rAdminList.json?.guilds?.find((g) => g.id === GUILD_ALLOWED);
    assertCondition(adminEntry?.botPresent === true, "B3 #1: Administrator debe listarse con botPresent:true");

    // 6. Dueño del servidor siempre permitido (sin llamar fetch)
    const rOwnerGet = await httpRequest(port, { path: `/api/tickets/${GUILD_OWNER}`, headers: headersFor("10.1.0.6") });
    const rOwnerPut = await httpRequest(port, {
      method: "PUT",
      path: `/api/tickets/${GUILD_OWNER}/config`,
      headers: headersFor("10.1.0.6"),
      body: { enabled: true },
    });
    assertCondition(
      rOwnerGet.status === 200 && rOwnerPut.status === 200 && ownerFetchCalled === 0,
      "B3 #1: dueño debe autorizarse siempre sin llamar fetch"
    );
    const ownerEntry = rAdminList.json?.guilds?.find((g) => g.id === GUILD_OWNER);
    assertCondition(ownerEntry?.botPresent === true, "B3 #1: servidor propio debe listarse con botPresent:true");

    // 7. Sesión válida con el bot ausente: sin acceso en lecturas ni escrituras y nunca botPresent:true
    const rAbsentGet = await httpRequest(port, { path: `/api/tickets/${GUILD_ABSENT}`, headers: headersFor("10.1.0.7") });
    const rAbsentPut = await httpRequest(port, {
      method: "PUT",
      path: `/api/tickets/${GUILD_ABSENT}/config`,
      headers: headersFor("10.1.0.7"),
      body: { enabled: true },
    });
    const rAbsentPost = await httpRequest(port, {
      method: "POST",
      path: `/api/tickets/${GUILD_ABSENT}/panel`,
      headers: headersFor("10.1.0.7"),
      body: { channelId: TEXT_CH_ID },
    });
    assertCondition(
      rAbsentGet.status === 403 && rAbsentPut.status === 403 && rAbsentPost.status === 403,
      `B3 #1: bot ausente debe devolver 403 en GET/PUT/POST, obtuvo ${rAbsentGet.status}/${rAbsentPut.status}/${rAbsentPost.status}`
    );
    const absentEntry = rAdminList.json?.guilds?.find((g) => g.id === GUILD_ABSENT);
    assertCondition(absentEntry && absentEntry.botPresent === false, "B3 #1: bot ausente solo puede aparecer con botPresent:false");

    // 8. Verificar que el orden (OPTIONS 204 -> 405 -> 429 -> 401 -> 404) y rate limit siguen idénticos
    const rlHeaders = headersFor("10.1.0.99");
    for (let i = 0; i < 30; i++) {
      const r = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: rlHeaders });
      assertCondition(r.headers["x-ratelimit-remaining"] === String(29 - i), "B3 #1: rate limit alterado en tickets");
    }
    const callsBefore429 = fetchCalls.length;
    const rTickets429 = await httpRequest(port, { path: `/api/tickets/${GUILD_ALLOWED}`, headers: rlHeaders });
    assertCondition(
      rTickets429.status === 429 && fetchCalls.length === callsBefore429,
      "B3 #1: 429 debe disparar antes de auth/revalidación Discord"
    );
  } finally {
    await currentApi.stopApi();
    mockClient.guilds.cache.clear();
    for (const [k, v] of origGuildsCache) mockClient.guilds.cache.set(k, v);
    resetStores();
  }

  assertCondition(contextMod.memberPermCache.size === 0, "B3 #1: stopApi() debe vaciar memberPermCache");

  // Confirmar diff intencional contra baseline 2d06da3 (degradado seguía recibiendo 200 por adminGuildIds)
  let baselineDemotedStatus = null;
  if (baselineApi) {
    resetStores();
    guildAllowed.members.cache = new Map([[USER_ID, makeMockMember(USER_ID, [])]]);
    const portBase = await getFreePort();
    await baselineApi.startApi(mockClient, { ...configBase, API_PORT: portBase }, silentLogger);
    try {
      const rLogin = await httpRequest(portBase, { path: "/api/auth/login?return_to=http://127.0.0.1:4321/tickets" });
      const dashState = extractCookieValue(rLogin.headers["set-cookie"], "redbot_oauth_state");
      const rCb = await httpRequest(portBase, {
        path: `/api/oauth/callback?code=dashcode&state=${encodeURIComponent(dashState)}`,
        headers: { Cookie: `redbot_oauth_state=${dashState}` },
      });
      const baseToken = extractCookieValue(rCb.headers["set-cookie"], "redbot_session");
      const rBaseTickets = await httpRequest(portBase, {
        path: `/api/tickets/${GUILD_ALLOWED}`,
        headers: { Cookie: `redbot_session=${encodeURIComponent(baseToken)}` },
      });
      baselineDemotedStatus = rBaseTickets.status;
      assertCondition(baselineDemotedStatus === 200, `Baseline ${BASELINE_COMMIT} debía permitir 200 por adminGuildIds`);
    } finally {
      await baselineApi.stopApi();
      resetStores();
    }
  }

  return { baselineDemotedStatus };
}

async function runApiTests({ verbose = false } = {}) {
  const envCtrl = installApiMocks();
  try {
    const singletonInfo = checkSingletonDeclarations();
    const baselineApi = loadBaselineApi();
    const currentApi = require(path.join(ROOT, "src/api"));

    let baselineRun = null;
    if (baselineApi) {
      baselineRun = await runHttpContractSuite(baselineApi, envCtrl);
    }

    const currentRun = await runHttpContractSuite(currentApi, envCtrl);
    const snapshotKeys = Object.keys(currentRun.snapshots);

    if (baselineRun) {
      assert.deepStrictEqual(
        currentRun.snapshots,
        baselineRun.snapshots,
        `Diferencias HTTP entre implementación actual y baseline ${BASELINE_COMMIT}`
      );
    }

    const splitChecks = await verifySplitModuleSingletons(envCtrl);
    const b3LogoutCheck = await verifyB3LogoutPostOnly(currentApi, baselineApi, envCtrl);
    const b3PermCheck = await verifyB3CanManageGuildLive(currentApi, baselineApi, envCtrl);

    const modeLabel = singletonInfo.isSplit ? "modular (src/api/)" : "monolito (src/api.js)";
    const vsLabel = baselineRun ? `vs ${BASELINE_COMMIT}: 0 diffs` : "sin historial git";
    const summary =
      `${snapshotKeys.length} escenarios HTTP (${modeLabel}, ${vsLabel}), ` +
      `B3 #2 (logout solo POST, GET->405), B3 #1 (permisos en vivo: degradado/10007->403, 5xx/timeout->503, owner/Admin->200, bot ausente->403), ` +
      `rate limit compartido, orden 204/405/429/401/404, stopApi sin fugas OK`;

    if (verbose) {
      console.log(`=== Test HTTP API (${modeLabel}, ${vsLabel}) ===`);
      console.log(`Escenarios comparados: ${snapshotKeys.length}/${snapshotKeys.length} idénticos (${snapshotKeys.join(", ")})`);
      console.log(`Declaraciones únicas: ${JSON.stringify(singletonInfo.counts)}`);
      console.log(`Módulos split (session -> tickets + EPHEMERAL_SESSION_SECRET): ${splitChecks.tested ? "OK" : "N/A (aún monolito)"}`);
      console.log(
        `B3 #2 logout solo POST: GET /auth/logout y GET /api/auth/logout -> 405 (diff intencional vs ${BASELINE_COMMIT} GET->${b3LogoutCheck.baselineGetStatus ?? "N/A"}), POST -> 200 y revoca`
      );
      console.log(
        `B3 #1 revalidación en vivo: GET cache/miss-fetch, PUT/POST force:true, degradado/10007 -> 403 (diff intencional vs ${BASELINE_COMMIT} ->${b3PermCheck.baselineDemotedStatus ?? "N/A"}), 5xx/timeout -> 503 sin caché, owner/Admin -> 200, bot ausente -> 403, memberPermCache limpia en stopApi()`
      );
      console.log(
        `Handles tras stopApi(): TCPServerWrap ${currentRun.resourcesBefore.TCPServerWrap} -> ${currentRun.resourcesAfter.TCPServerWrap}, ` +
        `Timeout ${currentRun.resourcesBefore.Timeout} -> ${currentRun.resourcesAfter.Timeout}`
      );
      console.log(`[OK] ${summary}`);
    }

    return summary;
  } finally {
    envCtrl.restore();
  }
}

if (require.main === module) {
  runApiTests({ verbose: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[FAIL] ${err?.stack || err?.message || err}`);
      process.exit(1);
    });
}

module.exports = { runApiTests };
