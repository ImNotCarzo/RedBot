"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapButtonStyle = void 0;

const discord_js_1 = require("discord.js");

const STYLE_MAP = {
  primary: discord_js_1.ButtonStyle.Primary,
  secondary: discord_js_1.ButtonStyle.Secondary,
  success: discord_js_1.ButtonStyle.Success,
  danger: discord_js_1.ButtonStyle.Danger,
  link: discord_js_1.ButtonStyle.Link,
};

/**
 * Maps a button style name (string) or ButtonStyle enum value to a ButtonStyle.
 * Defaults to Primary if the provided value is not recognized.
 */
function mapButtonStyle(style) {
  if (style === undefined || style === null) {
    return discord_js_1.ButtonStyle.Primary;
  }
  if (typeof style === "number") {
    return style;
  }
  const mapped = STYLE_MAP[style.toLowerCase()];
  if (mapped === undefined) {
    return discord_js_1.ButtonStyle.Primary;
  }
  return mapped;
}
exports.mapButtonStyle = mapButtonStyle;
