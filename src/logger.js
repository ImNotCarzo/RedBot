const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

class Logger {
  constructor(label, level = "info") {
    this.label = label;
    this.level = LEVELS[level.toUpperCase()] ?? LEVELS.INFO;
  }

  log(severity, message, meta = {}) {
    const numLevel = LEVELS[severity.toUpperCase()];
    if (numLevel === undefined || numLevel > this.level) return;

    const ts = new Date().toISOString();
    const base = `${ts} [${this.label}] ${severity.toUpperCase()}: ${message}`;

    if (Object.keys(meta).length) {
      console.log(base, JSON.stringify(meta));
    } else {
      console.log(base);
    }
  }

  error(msg, meta) { this.log("ERROR", msg, meta); }
  warn(msg, meta) { this.log("WARN", msg, meta); }
  info(msg, meta) { this.log("INFO", msg, meta); }
  debug(msg, meta) { this.log("DEBUG", msg, meta); }
}

module.exports = Logger;
