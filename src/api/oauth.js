const { applyOauthGuildLang } = require("../guild");
const { state } = require("./context");
const { json, sendHtml, parseCookies, safeEqualString } = require("./http");
const {
  issueOAuthState,
  consumeOAuthStateEntry,
  createDashboardSession,
  getRequestSession,
  revokeDashboardSession,
} = require("./session");

function getOAuthSettings() {
  return {
    clientId: state.botClient?.user?.id || state.apiConfig?.CLIENT_ID || process.env.CLIENT_ID || "",
    clientSecret: state.apiConfig?.CLIENT_SECRET || process.env.CLIENT_SECRET || "",
    redirectUri:
      state.apiConfig?.OAUTH_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI || "https://redbot.me/api/oauth/callback",
    successUrl: state.apiConfig?.OAUTH_SUCCESS_URL || process.env.OAUTH_SUCCESS_URL || "",
    permissions: state.apiConfig?.INVITE_PERMISSIONS || process.env.INVITE_PERMISSIONS || "8",
  };
}

function resolveSafeReturnUrl(rawUrl) {
  const fallback = state.apiConfig?.DASHBOARD_URL || process.env.DASHBOARD_URL || "https://redbot.me/tickets";
  if (!rawUrl || typeof rawUrl !== "string") return fallback;
  try {
    const parsed = new URL(rawUrl);
    const isProdOrigin =
      parsed.protocol === "https:" && (parsed.hostname === "redbot.me" || parsed.hostname === "www.redbot.me");
    const isLocalOrigin =
      parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (!isProdOrigin && !isLocalOrigin) return fallback;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function resolveEffectiveRedirectUri(urlObj) {
  const defaultRedirect = getOAuthSettings().redirectUri;
  const candidate = urlObj.searchParams.get("redirect_uri");
  if (candidate && typeof candidate === "string") {
    try {
      const parsed = new URL(candidate);
      let defaultOrigin = null;
      try { defaultOrigin = new URL(defaultRedirect).origin; } catch {}
      const isProdOrigin =
        parsed.protocol === "https:" && (parsed.hostname === "redbot.me" || parsed.hostname === "www.redbot.me");
      const isLocalOrigin =
        parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
      const isConfiguredOrigin = Boolean(defaultOrigin && parsed.origin === defaultOrigin);
      if (
        (isProdOrigin || isLocalOrigin || isConfiguredOrigin) &&
        (parsed.pathname.endsWith("/api/oauth/callback") || parsed.pathname.endsWith("/oauth/callback"))
      ) {
        return parsed.toString();
      }
    } catch {}
  }
  return defaultRedirect;
}

function isSecureRequest(req, redirectUri) {
  return Boolean(
    req.socket?.encrypted ||
    (state.apiConfig?.TRUST_PROXY && req.headers?.["x-forwarded-proto"] === "https") ||
    String(redirectUri || "").startsWith("https://")
  );
}

function handleInviteRedirect(req, res, urlObj) {
  const { clientId, redirectUri, permissions } = getOAuthSettings();
  if (!clientId) {
    return sendHtml(res, 503, "RedBot Invite", "Configuración incompleta", "CLIENT_ID no está configurado.");
  }

  const oauthState = issueOAuthState();
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(permissions || "8"),
    integration_type: "0",
    scope: "bot applications.commands identify",
    response_type: "code",
    redirect_uri: redirectUri,
    state: oauthState,
  });

  const guildId = urlObj.searchParams.get("guild_id");
  if (guildId && /^\d{17,22}$/.test(guildId)) {
    params.set("guild_id", guildId);
  }

  const secureAttr = isSecureRequest(req, redirectUri) ? "; Secure" : "";
  res.writeHead(302, {
    Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
    "Cache-Control": "no-store",
    "Set-Cookie": `redbot_oauth_state=${oauthState}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secureAttr}`,
  });
  res.end();
}

async function exchangeDiscordToken({ code, clientId, clientSecret, redirectUri }) {
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
    await tokenRes.body?.cancel?.().catch(() => {});
    throw new Error(`Discord token exchange failed (${tokenRes.status})`);
  }
  const tokenData = await tokenRes.json();
  if (!tokenData?.access_token) {
    throw new Error("Discord token exchange missing access_token");
  }
  return tokenData;
}

async function exchangeDiscordOAuth({ code, clientId, clientSecret, redirectUri }) {
  const tokenData = await exchangeDiscordToken({ code, clientId, clientSecret, redirectUri });
  const accessToken = tokenData.access_token;

  const userRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!userRes.ok) {
    await userRes.body?.cancel?.().catch(() => {});
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
  const tokenData = await exchangeDiscordToken({ code, clientId, clientSecret, redirectUri });
  const accessToken = tokenData.access_token;

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
    await userRes.body?.cancel?.().catch(() => {});
    await guildsRes.body?.cancel?.().catch(() => {});
    throw new Error(`Discord user profile fetch failed (${userRes.status})`);
  }
  if (!guildsRes.ok) {
    await userRes.body?.cancel?.().catch(() => {});
    await guildsRes.body?.cancel?.().catch(() => {});
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
      globalName: userData.global_name
        ? String(userData.global_name)
        : (userData.globalName ? String(userData.globalName) : null),
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
  const oauthState = issueOAuthState({ mode: "dashboard", returnTo, redirectUri });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify guilds",
    state: oauthState,
  });

  const secureAttr = isSecureRequest(req, redirectUri) ? "; Secure" : "";
  res.writeHead(302, {
    Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
    "Cache-Control": "no-store",
    "Set-Cookie": `redbot_oauth_state=${oauthState}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secureAttr}`,
  });
  res.end();
}

function handleDashboardGuilds(req, res, preloadedSession = undefined) {
  const session = preloadedSession !== undefined ? preloadedSession : getRequestSession(req);
  if (!session) {
    return json(res, 401, { error: "Unauthorized" }, { noStore: true });
  }

  const byId = new Map();
  const botGuilds = state.botClient?.guilds?.cache;

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
      if (byId.has(id)) continue;
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
  revokeDashboardSession(session);
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
  const requireState = state.apiConfig?.OAUTH_REQUIRE_STATE === true || process.env.OAUTH_REQUIRE_STATE === "true";

  let stateEntry = null;
  if (isDashboardFlow || requireState || stateParam || cookieState) {
    const cookieMatches = (isDashboardFlow || requireState)
      ? Boolean(cookieState) && safeEqualString(stateParam, cookieState)
      : (!cookieState || safeEqualString(stateParam, cookieState));
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
    state.log?.info("OAuth2 callback procesado", { guildId: guildId ?? null, lang: applied.lang });

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
    state.log?.warn("Error en callback OAuth2", { err: err?.message ?? String(err) });
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

module.exports = {
  getOAuthSettings,
  resolveSafeReturnUrl,
  resolveEffectiveRedirectUri,
  isSecureRequest,
  handleInviteRedirect,
  exchangeDiscordToken,
  exchangeDiscordOAuth,
  exchangeDiscordDashboardOAuth,
  handleAuthLoginRedirect,
  handleDashboardGuilds,
  handleAuthLogout,
  handleOAuthCallback,
};
