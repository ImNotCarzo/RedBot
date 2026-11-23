const mongoose = require("mongoose");
const { ChannelType } = require("discord.js");
const { INVITE_URL, SUPPORT_URL, isObfuscatedChannel } = require("../runtime");
const { formatUptime } = require("../shared/utils");
const { version: PACKAGE_VERSION } = require("../../package.json");
const { state } = require("./context");

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
  const client = state.botClient;
  if (!client?.readyAt) return { error: "Bot is starting up", ready: false };

  const guilds = client.guilds?.cache;
  const channels = client.channels?.cache;
  let totalUsers = 0;
  let totalEmojis = 0;
  let totalRoles = 0;
  let totalStickers = 0;
  if (guilds) {
    for (const g of guilds.values()) {
      totalUsers += g.memberCount ?? 0;
      totalEmojis += g.emojis?.cache?.size ?? 0;
      totalRoles += g.roles?.cache?.size ?? 0;
      totalStickers += g.stickers?.cache?.size ?? 0;
    }
  }

  let visibleChannels = 0;
  let textChannels = 0;
  let voiceChannels = 0;
  let categoryChannels = 0;
  let forumChannels = 0;
  let stageChannels = 0;

  if (channels) {
    for (const ch of channels.values()) {
      if (isObfuscatedChannel(ch)) continue;
      visibleChannels++;
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
    const { getCommands, CATEGORIES } = require("../../commands/slash/help");
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
      total: visibleChannels,
      text: textChannels,
      voice: voiceChannels,
      stage: stageChannels,
      forum: forumChannels,
      categories: categoryChannels,
    },
    emojis: totalEmojis,
    roles: totalRoles,
    stickers: totalStickers,
    commands: commandInfo,
    uptime: client.uptime ?? 0,
    uptimeFormatted: formatUptime(client.uptime ?? 0, { alwaysSeconds: true }),
    readyAt: client.readyAt?.toISOString() ?? null,
    ping: client.ws?.ping ?? -1,
    version: PACKAGE_VERSION,
    nodeVersion: process.version,
  };
}

function handleCommands() {
  try {
    const { getCommands, CATEGORIES, CATEGORY_LABELS } = require("../../commands/slash/help");
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
  const user = state.botClient?.user;

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
    support: SUPPORT_URL,
    website: "https://redbot.me",
    defaultPrefix: ".",
    version: PACKAGE_VERSION,
  };
}

function handleHealth() {
  const client = state.botClient;
  const mem = process.memoryUsage();
  const dbStates = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  const isReady = Boolean(client?.readyAt);

  return {
    status: isReady ? "operational" : "degraded",
    uptime: client?.uptime ?? 0,
    uptimeFormatted: formatUptime(client?.uptime ?? 0, { alwaysSeconds: true }),
    processUptime: Math.floor(process.uptime()),
    processUptimeFormatted: formatUptime(process.uptime() * 1000, { alwaysSeconds: true }),
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

module.exports = {
  handleRoot,
  handleStats,
  handleCommands,
  handleBot,
  handleHealth,
  routes,
};
