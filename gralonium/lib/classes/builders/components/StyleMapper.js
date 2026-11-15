"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultStyle = exports.setDefaultStyle = exports.getDefaultButtonStyle = exports.setDefaultButtonStyle = exports.mapButtonStyle = void 0;

const discord_js_1 = require("discord.js");

const STYLE_MAP = {
  primary: discord_js_1.ButtonStyle.Primary,
  secondary: discord_js_1.ButtonStyle.Secondary,
  success: discord_js_1.ButtonStyle.Success,
  danger: discord_js_1.ButtonStyle.Danger,
  link: discord_js_1.ButtonStyle.Link,
  ...(discord_js_1.ButtonStyle.Premium !== undefined ? { premium: discord_js_1.ButtonStyle.Premium } : {}),
};

let defaultButtonStyle = discord_js_1.ButtonStyle.Secondary;

function resolveStyleValue(style, fallback = defaultButtonStyle) {
  if (style === undefined || style === null) {
    return fallback;
  }
  if (typeof style === "number") {
    return style;
  }
  const mapped = STYLE_MAP[String(style).toLowerCase()];
  if (mapped === undefined) {
    return fallback;
  }
  return mapped;
}

/**
 * Sets the default fallback button style used when no explicit style is provided.
 */
function setDefaultButtonStyle(style) {
  defaultButtonStyle = resolveStyleValue(style, discord_js_1.ButtonStyle.Secondary);
  return defaultButtonStyle;
}
exports.setDefaultButtonStyle = setDefaultButtonStyle;
exports.setDefaultStyle = setDefaultButtonStyle;

/**
 * Returns the current default fallback button style.
 */
function getDefaultButtonStyle() {
  return defaultButtonStyle;
}
exports.getDefaultButtonStyle = getDefaultButtonStyle;
exports.getDefaultStyle = getDefaultButtonStyle;

/**
 * Maps a button style name (string) or ButtonStyle enum value to a ButtonStyle.
 * Defaults to the configured default button style (Secondary by default) if not recognized.
 */
function mapButtonStyle(style) {
  return resolveStyleValue(style, defaultButtonStyle);
}
exports.mapButtonStyle = mapButtonStyle;
