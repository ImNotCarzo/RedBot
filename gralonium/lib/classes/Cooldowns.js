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
    this.track.set(this.#key(command, id, bucket), {
      startedAt: now,
      expiresAt: now + time,
    });
  }

  async check(command, id, cooldown, bucket) {
    const key = this.#key(command, id, bucket);
    const tracked = this.track.get(key);
    if (!tracked) return null;

    if (Date.now() >= tracked.expiresAt) {
      this.track.delete(key);
      return null;
    }

    const elapsed = Date.now() - tracked.startedAt;
    if (elapsed >= cooldown) {
      this.track.delete(key);
      return null;
    }

    return {
      command,
      id,
      time: cooldown,
      bucket,
      left: cooldown - elapsed,
    };
  }
}
exports.Cooldowns = Cooldowns;
