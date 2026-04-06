"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCustomId = exports.validateSelectMenuOptions = exports.validateButtonCount = exports.validateTextContent = void 0;

/**
 * Validates that text content is non-empty.
 * Throws a descriptive error if validation fails.
 */
function validateTextContent(content) {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("[ComponentsV2Builder] Text content must be a non-empty string.");
  }
}
exports.validateTextContent = validateTextContent;

/**
 * Validates that a button row does not exceed 5 buttons.
 * Throws a descriptive error if validation fails.
 */
function validateButtonCount(count) {
  if (count > 5) {
    throw new Error("[ComponentsV2Builder] An ActionRow cannot contain more than 5 buttons.");
  }
}
exports.validateButtonCount = validateButtonCount;

/**
 * Validates that a select menu does not exceed 25 options.
 * Throws a descriptive error if validation fails.
 */
function validateSelectMenuOptions(count) {
  if (count > 25) {
    throw new Error("[ComponentsV2Builder] A StringSelectMenu cannot have more than 25 options.");
  }
}
exports.validateSelectMenuOptions = validateSelectMenuOptions;

/**
 * Generates a unique custom ID with an optional prefix.
 * Uses crypto.randomUUID when available, otherwise falls back to a
 * timestamp + random number combination to avoid collisions in clustered
 * or multi-process environments.
 */
function generateCustomId(prefix) {
  const base = prefix ? `${prefix}_` : "cv2_";
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${base}${crypto.randomUUID()}`;
  }
  return `${base}${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
exports.generateCustomId = generateCustomId;
