const mongoose = require("mongoose");
const { ChannelType } = require("discord.js");
const { isObfuscatedChannel } = require("../runtime");
const { state } = require("./context");
const { json, isAuthorized, readJsonBody } = require("./http");
const { getRequestSession, canManageGuild } = require("./session");

async function handleTicketsRoute(req, res, pathname, preloadedSession = undefined) {
  const match = pathname.match(/^\/api\/tickets\/(\d{17,22})(?:\/(config|panel))?$/);
  if (!match) return false;

  const guildId = match[1];
  const sub = match[2] || "";
  const guild = state.botClient?.guilds?.cache?.get(guildId) ?? null;

  const session = preloadedSession !== undefined ? preloadedSession : getRequestSession(req);
  const hasApiKey = Boolean(state.apiConfig?.API_KEY) && isAuthorized(req);
  if (session) {
    if (!canManageGuild(session, guildId, guild)) {
      json(res, 403, { error: "No tienes permisos de administración (ManageGuild) en este servidor." });
      return true;
    }
  } else if (!hasApiKey) {
    json(res, 401, { error: "Unauthorized" });
    return true;
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

    const { getTicketConfig } = require("../tickets");
    const { Ticket } = require("../database");
    const cfg = await getTicketConfig(guildId);
    let open = 0;
    let closed = 0;
    if (mongoose.connection.readyState === 1) {
      [open, closed] = await Promise.all([
        Ticket.countDocuments({ guildId, status: "open" }).catch(() => 0),
        Ticket.countDocuments({ guildId, status: "closed" }).catch(() => 0),
      ]);
    }

    const allChannels = [...(guild.channels?.cache?.values?.() ?? [])].filter((c) => !isObfuscatedChannel(c));
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

    const { getTicketConfig, parseTicketMenuOptions, updateTicketConfig } = require("../tickets");
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
      patch.categories = parseTicketMenuOptions(body.categories, guild);
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

    const { getTicketConfig, parseTicketMenuOptions, updateTicketConfig, buildTicketPanelPayload } = require("../tickets");
    const { getLang } = require("../guild");
    const lang = body.lang === "en" || body.lang === "es"
      ? body.lang
      : await getLang(guildId).catch(() => "es");

    const parsedOptions = body.options !== undefined
      ? parseTicketMenuOptions(body.options, guild)
      : (body.categories !== undefined ? parseTicketMenuOptions(body.categories, guild) : null);

    let effectiveOptions = parsedOptions;
    if (effectiveOptions === null && body.useStoredCategories !== false) {
      const stored = await getTicketConfig(guildId);
      if (stored?.categories?.length && body.mode !== "button") {
        effectiveOptions = stored.categories;
      }
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

    json(res, 200, { ok: true, channelId: targetCh.id, messageId: sent?.id ?? null }, { noStore: true });
    return true;
  }

  return false;
}

module.exports = { handleTicketsRoute };
