const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

/**
 * Simple structured logger with severity levels and ISO timestamps.
 *
 * @example
 * const log = new Logger("MAIN", "info");
 * log.info("Bot ready", { guilds: 42 });
 */
class Logger {
  /**
   * @param {string} label   - Module name shown in every log line.
   * @param {string} [level] - Minimum level to emit ("error"|"warn"|"info"|"debug"). Default "info".
   */
  constructor(label, level = "info") {
    this.label = label;
    this.level = LEVELS[level.toUpperCase()] ?? LEVELS.INFO;
  }

  /**
   * Emit a log line if `severity` is at or below the configured level.
   * @param {string} severity
   * @param {string} message
   * @param {object} [meta]
   */
  log(severity, message, meta = {}) {
    const numLevel = LEVELS[severity.toUpperCase()];
    if (numLevel === undefined || numLevel > this.level) return;

    const ts   = new Date().toISOString();
    const base = `${ts} [${this.label}] ${severity.toUpperCase()}: ${message}`;
    const keys = Object.keys(meta);

    if (keys.length) {
      console.log(base, JSON.stringify(meta));
    } else {
      console.log(base);
    }
  }

  /** @param {string} msg @param {object} [meta] */
  error(msg, meta) { this.log("ERROR", msg, meta); }

  /** @param {string} msg @param {object} [meta] */
  warn(msg, meta)  { this.log("WARN",  msg, meta); }

  /** @param {string} msg @param {object} [meta] */
  info(msg, meta)  { this.log("INFO",  msg, meta); }

  /** @param {string} msg @param {object} [meta] */
  debug(msg, meta) { this.log("DEBUG", msg, meta); }
}

module.exports = Logger;
