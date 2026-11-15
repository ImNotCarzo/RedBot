"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cooldowns = exports.Bucket = void 0;
const discord_js_1 = require("discord.js");

var Bucket;
(function (Bucket) {
  Bucket["Member"] = "MEMBER";
  Bucket["User"] = "USER";
  Bucket["Guild"] = "GUILD";
  Bucket["Channel"] = "CHANNEL";
})(Bucket || (exports.Bucket = Bucket = {}));

class Cooldowns {
  bot;
  track = new discord_js_1.Collection();

  constructor(bot) {
    this.bot = bot;
  }

  #key(command, id, bucket) {
    return `${command}#${bucket}#${id}`;
  }

  static resolveKey(command, group = null) {
    const commandName =
      typeof command === "string"
        ? command
        : command?.data?.name || command?.name || "unknown";
    const groupName =
      typeof group === "string"
        ? group
        : group?.data?.name || group?.name || "";

    return groupName ? `${groupName}:${commandName}` : commandName;
  }

  sweep(now = Date.now()) {
    let cleared = 0;
    for (const [key, entry] of this.track.entries()) {
      if (!entry || now >= entry.expiresAt) {
        this.track.delete(key);
        cleared += 1;
      }
    }
    return cleared;
  }

  async getCooldownSource(command, id, bucket) {
    const key = this.#key(command, id, bucket);
    const tracked = this.track.get(key);
    if (!tracked) return undefined;

    if (Date.now() >= tracked.expiresAt) {
      this.track.delete(key);
      return undefined;
    }

    return tracked.startedAt;
  }

  async setCooldownSource(command, id, bucket, time) {
    const now = Date.now();
    if (this.track.size >= 500) {
      this.sweep(now);
    }

    this.track.set(this.#key(command, id, bucket), {
      startedAt: now,
      expiresAt: now + time,
    });
  }

  async check(command, id, cooldown, bucket) {
    const key = this.#key(command, id, bucket);
    const tracked = this.track.get(key);
    if (!tracked) return null;

    const now = Date.now();
    if (now >= tracked.expiresAt) {
      this.track.delete(key);
      return null;
    }

    return {
      command,
      id,
      time: cooldown,
      bucket,
      left: tracked.expiresAt - now,
    };
  }
}
exports.Cooldowns = Cooldowns;
