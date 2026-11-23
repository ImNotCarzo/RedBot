const http = require("http");
const {
  RATE_MAX,
  PUBLIC_BROWSER_ROUTES,
  state,
  setApiContext,
  clearAllStores,
} = require("./context");
const { checkRate, json, setCors, isAuthorized } = require("./http");
const { getRequestSession, pruneExpiredStores } = require("./session");
const {
  handleInviteRedirect,
  handleAuthLoginRedirect,
  handleDashboardGuilds,
  handleAuthLogout,
  handleOAuthCallback,
} = require("./oauth");
const { routes } = require("./publicRoutes");
const { handleTicketsRoute } = require("./tickets");

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
  if (isLogoutRoute && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }
  if (!isTicketRoute && !isLogoutRoute && req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  // X-Forwarded-For solo se respeta con TRUST_PROXY=true (detras de un proxy que lo sobrescriba)
  const ip = (state.apiConfig?.TRUST_PROXY ? req.headers["x-forwarded-for"]?.split(",")[0]?.trim() : null)
    || req.socket?.remoteAddress
    || "unknown";
  const { remaining, exceeded } = checkRate(ip);
  res.setHeader("X-RateLimit-Limit", String(RATE_MAX));
  res.setHeader("X-RateLimit-Remaining", String(remaining));

  if (exceeded) {
    res.setHeader("Retry-After", "60");
    return json(res, 429, { error: "Too many requests", retryAfter: 60 });
  }

  const requestSession = isSessionRoute ? getRequestSession(req) : null;
  const hasSession = Boolean(requestSession);
  if (!PUBLIC_BROWSER_ROUTES.has(pathname) && !hasSession && !isAuthorized(req)) {
    return json(res, 401, { error: "Unauthorized" });
  }

  if (isTicketRoute) {
    try {
      const handled = await handleTicketsRoute(req, res, pathname, requestSession);
      if (handled) return;
    } catch (err) {
      state.log?.error("Error en endpoint de tickets", { endpoint: pathname, err: err?.message ?? String(err) });
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
    return handleDashboardGuilds(req, res, requestSession);
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
    state.log?.error("Error en endpoint de API", { endpoint: pathname, err: err?.message ?? String(err) });
    json(res, 500, { error: "Internal server error" });
  }
}

function startApi(client, config, logger) {
  return new Promise((resolve) => {
    setApiContext({ client, config, logger });

    const port = Number(config?.API_PORT) || 3000;
    const host = config?.API_HOST || process.env.API_HOST || undefined;
    state.server = http.createServer((req, res) => {
      Promise.resolve(handleRequest(req, res)).catch((err) => {
        state.log?.error("Error no controlado en API", { err: err?.message ?? String(err) });
        if (!res.headersSent) json(res, 500, { error: "Internal server error" });
      });
    });

    let settled = false;
    const settleOnce = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    state.server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        state.log.warn(`Puerto ${port} en uso, API no iniciada`);
        state.server = null;
        settleOnce();
        return;
      }
      state.log.error("Error en servidor API", { err: err.message });
      if (!state.server?.listening) {
        state.server = null;
        settleOnce();
      }
    });

    const onListen = () => {
      state.log.info("API iniciada", {
        port,
        ...(host ? { host } : {}),
        auth: config?.API_KEY ? "API key" : "pública (sin key)",
        cors: config?.API_CORS_ORIGIN || "*",
      });

      if (state.ratePruneTimer) clearInterval(state.ratePruneTimer);
      state.ratePruneTimer = setInterval(() => pruneExpiredStores(), 5 * 60_000);
      state.ratePruneTimer.unref();

      settleOnce();
    };

    if (host) state.server.listen(port, host, onListen);
    else state.server.listen(port, onListen);
  });
}

function stopApi() {
  return new Promise((resolve) => {
    if (state.ratePruneTimer) {
      clearInterval(state.ratePruneTimer);
      state.ratePruneTimer = null;
    }
    clearAllStores();

    if (!state.server) return resolve();

    state.server.close((err) => {
      if (err) state.log?.error("Error cerrando API", { err: err.message });
      else state.log?.info("API cerrada");
      state.server = null;
      resolve();
    });
  });
}

module.exports = { startApi, stopApi };
