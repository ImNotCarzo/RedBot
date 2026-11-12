"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2Text = void 0;

const helpers_js_1 = require("./helpers.js");

function normalizeFieldRow(row, options) {
  if (!row) return null;

  let label;
  let value;

  if (Array.isArray(row)) {
    [label, value] = row;
  } else if (typeof row === "object") {
    label = row.label ?? row.name;
    value = row.value;
  } else {
    return null;
  }

  if (label === undefined || label === null || String(label).trim() === "") return null;

  const omitEmpty = options?.omitEmpty !== false;
  if (omitEmpty && (value === undefined || value === null || value === "")) {
    return null;
  }

  const formattedValue = value === undefined || value === null || value === "" ? options?.fallback ?? "-" : String(value);
  return `> **${String(label).trim()}:** ${formattedValue}`;
}

class V2Text {
  static clip(text, maxLen = helpers_js_1.SAFE_V2_TEXT_LENGTH, fallback = "") {
    return helpers_js_1.clipText(text, maxLen, fallback);
  }

  static code(value) {
    return `\`${String(value ?? "")}\``;
  }

  static subtext(text, maxLen = null) {
    const str = String(text ?? "").trim();
    if (!str) return "";
    const clipped = maxLen ? helpers_js_1.clipText(str, maxLen) : str;
    return `-# ${clipped}`;
  }

  static heading(text, level = 3, maxLen = null) {
    const str = String(text ?? "").trim();
    if (!str) return "";
    const hashes = "#".repeat(Math.min(3, Math.max(1, Number(level) || 3)));
    const clipped = maxLen ? helpers_js_1.clipText(str, maxLen) : str;
    return `${hashes} ${clipped}`;
  }

  static fields(rows, options = {}) {
    if (!Array.isArray(rows)) return "";
    const lines = rows.map((row) => normalizeFieldRow(row, options)).filter(Boolean);
    return lines.join("\n");
  }

  static sectionBlock(heading, rows, options = {}) {
    const body = V2Text.fields(rows, options);
    if (!body && options?.omitIfEmpty !== false) return "";
    const title = String(heading ?? "").trim();
    if (!title) return body;
    return body ? `**${title}**\n${body}` : `**${title}**`;
  }

  static quote(text, maxLen = null, fallback = "-") {
    const raw = String(text ?? "").trimEnd();
    if (!raw) return fallback ? `> ${fallback}` : "";

    const quoted = raw
      .split(/\r?\n/)
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");

    return maxLen ? helpers_js_1.clipText(quoted, maxLen, fallback ? `> ${fallback}` : "") : quoted;
  }

  static join(blocks, separator = "\n") {
    return (Array.isArray(blocks) ? blocks : [blocks])
      .map((item) => (typeof item === "string" ? item.trimEnd() : ""))
      .filter(Boolean)
      .join(separator);
  }
}

exports.V2Text = V2Text;
