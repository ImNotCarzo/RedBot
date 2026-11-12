"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disableMessageComponents =
  exports.disableComponents =
  exports.countComponents =
  exports.countTextLength =
  exports.isV2ComponentType =
  exports.clipText =
  exports.parseEmoji =
  exports.isValidLinkUrl =
  exports.isValidMediaUrl =
  exports.resolveAccentColor =
  exports.generateCustomId =
  exports.validateSelectMenuOptions =
  exports.validateButtonCount =
  exports.validateTextContent =
  exports.MAX_V2_TOP_LEVEL_COMPONENTS =
  exports.MAX_V2_COMPONENTS =
  exports.SAFE_V2_TEXT_LENGTH =
  exports.MAX_V2_TEXT_LENGTH =
    void 0;

const discord_js_1 = require("discord.js");
const crypto_1 = require("crypto");

const MAX_V2_TEXT_LENGTH = 4000;
exports.MAX_V2_TEXT_LENGTH = MAX_V2_TEXT_LENGTH;

const SAFE_V2_TEXT_LENGTH = 3950;
exports.SAFE_V2_TEXT_LENGTH = SAFE_V2_TEXT_LENGTH;

const MAX_V2_COMPONENTS = 40;
exports.MAX_V2_COMPONENTS = MAX_V2_COMPONENTS;

const MAX_V2_TOP_LEVEL_COMPONENTS = 10;
exports.MAX_V2_TOP_LEVEL_COMPONENTS = MAX_V2_TOP_LEVEL_COMPONENTS;

const COLOR_PRESETS = (() => {
  const map = new Map();
  if (discord_js_1.Colors && typeof discord_js_1.Colors === "object") {
    for (const [key, val] of Object.entries(discord_js_1.Colors)) {
      if (typeof val === "number") map.set(key.toLowerCase(), val);
    }
  }
  map.set("primary", 0x5865f2);
  map.set("info", 0x5865f2);
  map.set("success", 0x57f287);
  map.set("warning", 0xfee75c);
  map.set("danger", 0xed4245);
  map.set("error", 0xed4245);
  map.set("dark", 0x2b2d31);
  return map;
})();

const V2_COMPONENT_TYPES = new Set(
  [
    discord_js_1.ComponentType?.Section ?? 9,
    discord_js_1.ComponentType?.TextDisplay ?? 10,
    discord_js_1.ComponentType?.Thumbnail ?? 11,
    discord_js_1.ComponentType?.MediaGallery ?? 12,
    discord_js_1.ComponentType?.File ?? 13,
    discord_js_1.ComponentType?.Separator ?? 14,
    discord_js_1.ComponentType?.Container ?? 17,
  ].filter((v) => typeof v === "number")
);

const SELECT_COMPONENT_TYPES = new Set(
  [
    discord_js_1.ComponentType?.StringSelect ?? 3,
    discord_js_1.ComponentType?.UserSelect ?? 5,
    discord_js_1.ComponentType?.RoleSelect ?? 6,
    discord_js_1.ComponentType?.MentionableSelect ?? 7,
    discord_js_1.ComponentType?.ChannelSelect ?? 8,
  ].filter((v) => typeof v === "number")
);

/**
 * Validates that text content is non-empty.
 * Throws a descriptive error if validation fails.
 */
function validateTextContent(content, options) {
  if (options?.ignoreEmpty && (content === undefined || content === null || (typeof content === "string" && content.trim().length === 0))) {
    return false;
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("[ComponentsV2Builder] Text content must be a non-empty string.");
  }
  return true;
}
exports.validateTextContent = validateTextContent;

/**
 * Validates that a button row does not exceed 5 buttons.
 */
function validateButtonCount(count) {
  if (count > 5) {
    throw new Error("[ComponentsV2Builder] An ActionRow cannot contain more than 5 buttons.");
  }
}
exports.validateButtonCount = validateButtonCount;

/**
 * Validates that a select menu does not exceed 25 options.
 */
function validateSelectMenuOptions(count) {
  if (count > 25) {
    throw new Error("[ComponentsV2Builder] A StringSelectMenu cannot have more than 25 options.");
  }
}
exports.validateSelectMenuOptions = validateSelectMenuOptions;

/**
 * Generates a unique custom ID with an optional prefix.
 */
function generateCustomId(prefix) {
  const base = prefix ? `${prefix}_` : "cv2_";
  if (typeof crypto_1.randomUUID === "function") {
    return `${base}${crypto_1.randomUUID()}`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${base}${crypto.randomUUID()}`;
  }
  return `${base}${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
exports.generateCustomId = generateCustomId;

/**
 * Resolves a color input (hex string, RGB tuple, integer, or preset name) to a 24-bit RGB integer.
 */
function resolveAccentColor(color, fallback) {
  if (color === undefined || color === null || color === "") {
    return fallback !== undefined && fallback !== null ? resolveAccentColor(fallback) : null;
  }

  if (typeof color === "number") {
    if (Number.isInteger(color) && color >= 0 && color <= 0xffffff) {
      return color;
    }
    if (fallback !== undefined && fallback !== null) return resolveAccentColor(fallback);
    throw new RangeError(`[ComponentsV2Builder] Accent color integer must be between 0x000000 and 0xffffff (received ${color}).`);
  }

  if (Array.isArray(color) && color.length === 3) {
    const [r, g, b] = color.map(Number);
    if ([r, g, b].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return (r << 16) + (g << 8) + b;
    }
    if (fallback !== undefined && fallback !== null) return resolveAccentColor(fallback);
    throw new RangeError("[ComponentsV2Builder] RGB tuple must contain 3 integers between 0 and 255.");
  }

  if (typeof color === "string") {
    const trimmed = color.trim();
    const preset = COLOR_PRESETS.get(trimmed.toLowerCase());
    if (preset !== undefined) return preset;

    const hex = trimmed.replace(/^(?:#|0x)/i, "");
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return Number.parseInt(hex, 16);
    }
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      const expanded = hex
        .split("")
        .map((c) => c + c)
        .join("");
      return Number.parseInt(expanded, 16);
    }
  }

  if (fallback !== undefined && fallback !== null) {
    return resolveAccentColor(fallback);
  }
  throw new TypeError(`[ComponentsV2Builder] Invalid accent color: ${String(color)}`);
}
exports.resolveAccentColor = resolveAccentColor;

/**
 * Checks whether a URL is valid for Discord media components (http://, https://, attachment://).
 */
function isValidMediaUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^attachment:\/\/[^\s/]+$/i.test(trimmed)) return true;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
exports.isValidMediaUrl = isValidMediaUrl;

/**
 * Checks whether a URL is valid for Discord link buttons (http://, https://, discord://).
 */
function isValidLinkUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (!/^(https?|discord):\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:", "discord:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
exports.isValidLinkUrl = isValidLinkUrl;

/**
 * Parses an emoji input (unicode string, custom Discord markup `<:name:id>` / `<a:name:id>`,
 * snowflake ID, `name:id`, or `{ id, name, animated }`) into APIMessageComponentEmoji.
 */
function parseEmoji(emoji) {
  if (!emoji) return null;

  if (typeof emoji === "object") {
    const parsed = {};
    if (emoji.id) parsed.id = String(emoji.id);
    if (emoji.name) parsed.name = String(emoji.name);
    if (emoji.animated !== undefined) parsed.animated = Boolean(emoji.animated);
    return parsed.id || parsed.name ? parsed : null;
  }

  const raw = String(emoji).trim();
  if (!raw) return null;

  const markupMatch = raw.match(/^<(a)?:([a-zA-Z0-9_~]+):(\d{15,22})>$/);
  if (markupMatch) {
    return {
      animated: Boolean(markupMatch[1]),
      name: markupMatch[2],
      id: markupMatch[3],
    };
  }

  const colonMatch = raw.match(/^(?:(a):)?([a-zA-Z0-9_~]+):(\d{15,22})$/);
  if (colonMatch) {
    return {
      animated: Boolean(colonMatch[1]),
      name: colonMatch[2],
      id: colonMatch[3],
    };
  }

  if (/^\d{15,22}$/.test(raw)) {
    return { id: raw };
  }

  return { name: raw };
}
exports.parseEmoji = parseEmoji;

/**
 * Clips text to a maximum length, appending an ellipsis when truncated.
 */
function clipText(text, maxLen = SAFE_V2_TEXT_LENGTH, fallback = "") {
  const str = String(text ?? "").trim();
  if (!str) return fallback;
  if (!Number.isFinite(maxLen) || maxLen <= 0) return "";
  if (str.length <= maxLen) return str;
  if (maxLen <= 1) return str.slice(0, maxLen);
  return `${str.slice(0, maxLen - 1)}…`;
}
exports.clipText = clipText;

function toPlainComponent(component) {
  if (!component || typeof component !== "object") return component;
  if (typeof component.toJSON === "function") return component.toJSON();
  return JSON.parse(JSON.stringify(component));
}

function isV2ComponentType(type) {
  return V2_COMPONENT_TYPES.has(type);
}
exports.isV2ComponentType = isV2ComponentType;

function sumTextNode(node) {
  if (!node || typeof node !== "object") return 0;
  const data = typeof node.toJSON === "function" ? node.toJSON() : node.data ?? node;
  let total = 0;

  if (data.type === (discord_js_1.ComponentType?.TextDisplay ?? 10) && typeof data.content === "string") {
    total += data.content.length;
  }

  const children = node.components ?? data.components;
  if (Array.isArray(children)) {
    for (const child of children) {
      total += sumTextNode(child);
    }
  }

  return total;
}

/**
 * Counts total characters across all TextDisplay components in a component list.
 */
function countTextLength(components) {
  if (!Array.isArray(components)) return 0;
  let total = 0;
  for (const comp of components) {
    total += sumTextNode(comp);
  }
  return total;
}
exports.countTextLength = countTextLength;

function countComponentNode(node) {
  if (!node || typeof node !== "object") return 0;
  const data = typeof node.toJSON === "function" ? node.toJSON() : node.data ?? node;
  let total = 1;

  const children = node.components ?? data.components;
  if (Array.isArray(children)) {
    for (const child of children) {
      total += countComponentNode(child);
    }
  }

  const accessory = node.accessory ?? data.accessory;
  if (accessory && typeof accessory === "object") {
    total += countComponentNode(accessory);
  }

  const items = node.items ?? data.items;
  if (Array.isArray(items)) {
    total += items.length;
  }

  return total;
}

/**
 * Counts total component nodes (including nested Container, Section, ActionRow, and MediaGallery items).
 */
function countComponents(components) {
  if (!Array.isArray(components)) return 0;
  let total = 0;
  for (const comp of components) {
    total += countComponentNode(comp);
  }
  return total;
}
exports.countComponents = countComponents;

function disableNodeInPlace(node, options) {
  if (!node || typeof node !== "object") return node;

  const disableButtons = options?.disableButtons !== false;
  const disableSelects = options?.disableSelects !== false;
  const disableLinks = Boolean(options?.disableLinks);

  if (node.type === (discord_js_1.ComponentType?.Button ?? 2)) {
    if (disableButtons && (disableLinks || node.style !== discord_js_1.ButtonStyle.Link)) {
      node.disabled = true;
    }
    return node;
  }

  if (SELECT_COMPONENT_TYPES.has(node.type)) {
    if (disableSelects) {
      node.disabled = true;
    }
    return node;
  }

  if (Array.isArray(node.components)) {
    node.components = node.components.map((child) => disableNodeInPlace(child, options));
  }

  if (node.accessory && typeof node.accessory === "object") {
    node.accessory = disableNodeInPlace(node.accessory, options);
  }

  return node;
}

/**
 * Recursively clones and disables buttons/selects in both V1 ActionRows and V2 Containers/Sections.
 */
function disableComponents(components, options = {}) {
  if (!Array.isArray(components) || !components.length) return [];
  return components.map((comp) => disableNodeInPlace(toPlainComponent(comp), options));
}
exports.disableComponents = disableComponents;

/**
 * Edits a Discord message to disable all interactive components (V1 or V2) recursively.
 */
async function disableMessageComponents(message, options = {}) {
  if (!message?.editable || !message.components?.length) return null;

  const components = disableComponents(message.components, options);
  const isV2 = Boolean(
    message.flags?.has?.(discord_js_1.MessageFlags?.IsComponentsV2) ||
      components.some((c) => isV2ComponentType(c?.type))
  );

  const editPayload = { components };
  if (isV2 && discord_js_1.MessageFlags?.IsComponentsV2 !== undefined) {
    editPayload.flags = discord_js_1.MessageFlags.IsComponentsV2;
  }

  return message.edit(editPayload).catch(() => null);
}
exports.disableMessageComponents = disableMessageComponents;
