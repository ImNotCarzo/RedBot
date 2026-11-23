const crypto = require("crypto");
const { Logger } = require("../runtime");

const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const MAX_RATE_ENTRIES = 5000;
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const MAX_OAUTH_STATES = 2000;
const DASHBOARD_SESSION_TTL_MS = 24 * 60 * 60_000;
const MAX_DASHBOARD_SESSIONS = 2000;
const MAX_REVOKED_SESSIONS = 5000;
const PUBLIC_BROWSER_ROUTES = new Set([
  "/api/stats",
  "/api/commands",
  "/invite",
  "/api/invite",
  "/oauth/callback",
  "/api/oauth/callback",
  "/auth/login",
  "/api/auth/login",
  "/auth/logout",
  "/api/auth/logout",
]);

const rateStore = new Map();
const oauthStates = new Map();
const dashboardSessions = new Map();
const revokedSessions = new Map();

const state = {
  server: null,
  botClient: null,
  apiConfig: null,
  log: null,
  ratePruneTimer: null,
};

function setApiContext({ client = null, config = null, logger = null } = {}) {
  state.botClient = client;
  state.apiConfig = config;
  state.log = logger ?? new Logger("API");
}

function clearAllStores() {
  rateStore.clear();
  oauthStates.clear();
  dashboardSessions.clear();
  revokedSessions.clear();
}

module.exports = {
  EPHEMERAL_SESSION_SECRET,
  RATE_WINDOW_MS,
  RATE_MAX,
  MAX_RATE_ENTRIES,
  OAUTH_STATE_TTL_MS,
  MAX_OAUTH_STATES,
  DASHBOARD_SESSION_TTL_MS,
  MAX_DASHBOARD_SESSIONS,
  MAX_REVOKED_SESSIONS,
  PUBLIC_BROWSER_ROUTES,
  rateStore,
  oauthStates,
  dashboardSessions,
  revokedSessions,
  state,
  setApiContext,
  clearAllStores,
};
