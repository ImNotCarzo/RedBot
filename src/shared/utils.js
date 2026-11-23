const mongoose = require("mongoose");
const { ChannelFlags, PermissionFlagsBits } = require("discord.js");
const { V2Text } = require("gralonium");

const MAX_TIMEOUT_MS = 2_147_483_647;
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const TRANSLATE_LANG_NAMES = {
  auto: "Automático",
  es: "Español",
  en: "Inglés",
  pt: "Portugués",
  fr: "Francés",
  de: "Alemán",
  it: "Italiano",
  ja: "Japonés",
  ko: "Coreano",
  "zh-cn": "Chino",
  "zh-tw": "Chino tradicional",
  ru: "Ruso",
  ar: "Árabe",
  nl: "Neerlandés",
};

const TRANSLATE_LANGUAGES = [
  { name: "Español (es)", value: "es" },
  { name: "Inglés (en)", value: "en" },
  { name: "Portugués (pt)", value: "pt" },
  { name: "Francés (fr)", value: "fr" },
  { name: "Alemán (de)", value: "de" },
  { name: "Italiano (it)", value: "it" },
  { name: "Japonés (ja)", value: "ja" },
  { name: "Coreano (ko)", value: "ko" },
  { name: "Chino simplificado (zh-CN)", value: "zh-CN" },
  { name: "Ruso (ru)", value: "ru" },
  { name: "Árabe (ar)", value: "ar" },
  { name: "Neerlandés (nl)", value: "nl" },
];

const TRANSLATE_REPLY_LANGS = new Set([
  "es", "en", "pt", "fr", "de", "it", "ja", "ko", "zh", "zh-cn", "zh-tw", "ru", "ar", "nl",
]);

function isDbReady(model = null) {
  if (model?.db) return model.db.readyState === 1;
  return mongoose.connection.readyState === 1;
}

function clearTimerMap(timerMap, key = null) {
  if (key !== null && key !== undefined) {
    const existing = timerMap.get(key);
    if (existing) {
      clearTimeout(existing);
      timerMap.delete(key);
    }
    return;
  }
  for (const timer of timerMap.values()) clearTimeout(timer);
  timerMap.clear();
}

function scheduleLongTimeout(timerMap, key, targetTime, onFire) {
  const targetMs = targetTime instanceof Date ? targetTime.getTime() : Number(targetTime);
  if (!Number.isFinite(targetMs)) return null;

  clearTimerMap(timerMap, key);

  const delay = targetMs - Date.now();
  if (delay <= 0) {
    onFire();
    return null;
  }

  const timer = setTimeout(() => {
    if (timerMap.get(key) !== timer) return;
    timerMap.delete(key);
    if (delay > MAX_TIMEOUT_MS) {
      scheduleLongTimeout(timerMap, key, targetMs, onFire);
    } else {
      onFire();
    }
  }, Math.min(delay, MAX_TIMEOUT_MS));
  timer.unref?.();
  timerMap.set(key, timer);
  return timer;
}

function decodeHtmlEntities(str, { stripCdata = false, trim = false } = {}) {
  if (!str) return "";
  let out = String(str);
  if (stripCdata) out = out.replace(/<!\[CDATA\[|\]\]>/g, "");
  out = out
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&");
  return trim ? out.trim() : out;
}

/**
 * Valida patrones regex rechazando constructos con riesgo de backtracking catastrofico (ReDoS).
 */
function isSafeRegexPattern(pattern, { maxLen = 80, allowLookaround = true } = {}) {
  if (typeof pattern !== "string" || !pattern.length || pattern.length > maxLen) return false;
  if (!allowLookaround && /\(\?[=!<]/.test(pattern)) return false;
  if (/\\[1-9]/.test(pattern)) return false;
  if (/\([^)]*[+*?]\)[+*?{]/.test(pattern)) return false;
  if (/\([^)]*\|[^)]*\)[+*?{]/.test(pattern)) return false;
  if (/(\.\*){2,}|(\.\+){2,}/.test(pattern)) return false;
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

function formatLanguageLabel(langCode) {
  const key = V2Text.clip(langCode, 40, "");
  const label = TRANSLATE_LANG_NAMES[key.toLowerCase()];
  if (!label) return key || "desconocido";
  return key.toLowerCase() === "auto" ? label : `${label} (${key})`;
}

const num = (n) => Number(n).toLocaleString("es-ES");

function formatUptime(ms, { alwaysSeconds = false } = {}) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (alwaysSeconds || !parts.length || seconds) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function isValidImageAttachment(attachment, maxBytes = MAX_IMAGE_SIZE_BYTES) {
  if (!attachment) return false;
  const ct = attachment.contentType ?? "";
  const name = attachment.name ?? "";
  const isImage = VALID_IMAGE_TYPES.some((t) => ct.startsWith(t)) || /\.(png|jpe?g|gif|webp)$/i.test(name);
  return isImage && (attachment.size ?? 0) <= maxBytes;
}

function validateImageAttachment(ctx, attachment) {
  if (!attachment) return ctx.ephemeral("Debes adjuntar una imagen");
  const ct = attachment.contentType ?? "";
  const name = attachment.name ?? "";
  const isImage = VALID_IMAGE_TYPES.some((t) => ct.startsWith(t)) || /\.(png|jpe?g|gif|webp)$/i.test(name);
  if (!isImage) {
    return ctx.ephemeral("El archivo debe ser una imagen (jpg, png, gif, webp)");
  }
  if ((attachment.size ?? 0) > MAX_IMAGE_SIZE_BYTES) {
    return ctx.ephemeral("La imagen no puede superar los 8MB");
  }
  return null;
}

async function fetchBotMember(guild, { force = false } = {}) {
  if (!guild) return null;
  if (force) {
    return guild.members?.fetchMe?.({ force: true }).catch(() => guild.members?.me ?? null) ?? guild.members?.me ?? null;
  }
  return guild.members?.me ?? guild.members?.fetchMe?.().catch(() => null) ?? null;
}

function canBotManageRole(me, role) {
  return Boolean(
    role &&
    !role.managed &&
    me?.permissions?.has?.(PermissionFlagsBits.ManageRoles) &&
    role.position < me.roles.highest.position
  );
}

function validateRoleHierarchy(
  ctx,
  role,
  {
    requireUserManageRoles = false,
    notFoundMsg = "No encontré ese rol en el servidor",
    unmanagedMsg = "Ese rol no puede gestionarse automáticamente",
    userPermMsg = "Necesitas el permiso **Administrar roles** para configurar ese rol",
    userHierarchyMsg = "No puedes configurar un rol igual o superior a tu rol más alto",
    botHierarchyMsg = "Ese rol está igual o por encima de mi rol más alto",
  } = {}
) {
  if (!role) return notFoundMsg;
  if (role.id === ctx.guild.id || role.managed) return unmanagedMsg;
  if (requireUserManageRoles && !ctx.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    return userPermMsg;
  }
  if (ctx.member.id !== ctx.guild.ownerId) {
    const userHighest = ctx.member?.roles?.highest?.position ?? -1;
    if (userHighest === -1 || role.position >= userHighest) {
      return userHierarchyMsg;
    }
  }
  const me = ctx.guild.members?.me;
  if (me && role.position >= me.roles.highest.position) {
    return botHierarchyMsg;
  }
  return null;
}

function isObfuscatedChannel(channel) {
  return Boolean(channel?.flags?.has?.(ChannelFlags.ChannelObfuscated)) || channel?.name === "___hidden___";
}

function checkTargetChannelAccess(
  ctx,
  channel,
  requiredPerms = [],
  {
    crossGuildMsg = "Ese canal no pertenece a este servidor",
    permMsg = "No tienes permisos suficientes en ese canal",
  } = {}
) {
  if (!channel) return "No se pudo obtener el canal";
  if (isObfuscatedChannel(channel)) return "No tengo acceso a ese canal";
  if (channel.guildId && ctx.guild?.id && channel.guildId !== ctx.guild.id) {
    return crossGuildMsg;
  }
  if (ctx.member && ctx.member.id !== ctx.guild?.ownerId && typeof channel.permissionsFor === "function") {
    const perms = channel.permissionsFor(ctx.member);
    if (perms && (!perms.has(PermissionFlagsBits.ViewChannel) || requiredPerms.some((p) => !perms.has(p)))) {
      return permMsg;
    }
  }
  return null;
}

module.exports = {
  MAX_TIMEOUT_MS,
  MAX_IMAGE_SIZE_BYTES,
  VALID_IMAGE_TYPES,
  TRANSLATE_LANGUAGES,
  TRANSLATE_REPLY_LANGS,
  isDbReady,
  clearTimerMap,
  scheduleLongTimeout,
  decodeHtmlEntities,
  isSafeRegexPattern,
  formatLanguageLabel,
  num,
  formatUptime,
  isValidImageAttachment,
  validateImageAttachment,
  fetchBotMember,
  canBotManageRole,
  validateRoleHierarchy,
  checkTargetChannelAccess,
};
