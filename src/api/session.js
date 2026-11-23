const crypto = require("crypto");
const {
  EPHEMERAL_SESSION_SECRET,
  RATE_WINDOW_MS,
  OAUTH_STATE_TTL_MS,
  MAX_OAUTH_STATES,
  DASHBOARD_SESSION_TTL_MS,
  MAX_DASHBOARD_SESSIONS,
  MAX_REVOKED_SESSIONS,
  rateStore,
  oauthStates,
  dashboardSessions,
  revokedSessions,
  state,
} = require("./context");
const { parseCookies, safeEqualString } = require("./http");

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
  const oauthState = meta?.mode === "dashboard" ? `dash_${raw}` : raw;
  oauthStates.set(oauthState, {
    exp: now + OAUTH_STATE_TTL_MS,
    ...(meta && typeof meta === "object" ? meta : {}),
  });
  return oauthState;
}

function consumeOAuthStateEntry(oauthState) {
  if (!oauthState || typeof oauthState !== "string") return null;
  const rawEntry = oauthStates.get(oauthState);
  if (!rawEntry) return null;
  oauthStates.delete(oauthState);
  const entry = typeof rawEntry === "number" ? { exp: rawEntry } : rawEntry;
  if (!entry || !entry.exp || entry.exp <= Date.now()) return null;
  return entry;
}

function getSessionSecret() {
  const explicit =
    state.apiConfig?.SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    state.apiConfig?.CLIENT_SECRET ||
    process.env.CLIENT_SECRET ||
    state.apiConfig?.API_KEY ||
    process.env.API_KEY;
  if (explicit) return explicit;
  const botToken = state.apiConfig?.TOKEN || process.env.TOKEN;
  if (botToken) {
    return crypto.createHash("sha256").update(`redbot-session:${botToken}`).digest("hex");
  }
  return EPHEMERAL_SESSION_SECRET;
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
    if (payload.sid && revokedSessions.has(payload.sid)) return null;
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

function revokeDashboardSession(session) {
  if (!session?.sid) return;
  dashboardSessions.delete(session.sid);
  if (revokedSessions.size >= MAX_REVOKED_SESSIONS) {
    const oldest = revokedSessions.keys().next().value;
    if (oldest !== undefined) revokedSessions.delete(oldest);
  }
  revokedSessions.set(session.sid, Number(session.exp) || (Date.now() + DASHBOARD_SESSION_TTL_MS));
}

function pruneExpiredStores(now = Date.now()) {
  for (const [ip, entry] of rateStore) {
    if (now - entry.start > RATE_WINDOW_MS * 2) rateStore.delete(ip);
  }
  for (const [oauthState, entry] of oauthStates) {
    const exp = typeof entry === "number" ? entry : entry?.exp;
    if (!exp || exp <= now) oauthStates.delete(oauthState);
  }
  for (const [sid, session] of dashboardSessions) {
    if (!session || session.exp <= now) dashboardSessions.delete(sid);
  }
  for (const [sid, exp] of revokedSessions) {
    if (!exp || exp <= now) revokedSessions.delete(sid);
  }
}

module.exports = {
  issueOAuthState,
  consumeOAuthStateEntry,
  getSessionSecret,
  hasManageGuildBits,
  createDashboardSession,
  verifyDashboardSessionToken,
  getRequestSession,
  canManageGuild,
  revokeDashboardSession,
  pruneExpiredStores,
};
