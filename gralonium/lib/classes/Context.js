"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Context = void 0;

const tslib_1 = require("tslib");
const DJS = tslib_1.__importStar(require("discord.js"));

class Context {
  bot;
  args;
  data;
  prefix = "";
  isEditedMessage = false;
  command;
  parent = null;
  params;

  constructor(bot, data) {
    this.bot = bot;
    this.data = data;
    this.command = null;
    this.params = this.data instanceof DJS.Message ? [] : [];
    this.args = this.data instanceof DJS.Message ? [] : null;
  }

  get message() {
    return this.data instanceof DJS.Message ? this.data : null;
  }

  get interaction() {
    return this.data instanceof DJS.Message ? null : this.data;
  }

  get author() {
    return this.data instanceof DJS.Message ? this.data.author : this.data.user;
  }

  get channel() {
    return this.data.channel || null;
  }

  get member() {
    return this.data.member || null;
  }

  get guild() {
    return this.data.guild || null;
  }

  static #isRateLimitError(error) {
    if (!error) return false;
    if (error?.code === 429) return true;
    if (error?.status === 429) return true;
    return false;
  }

  static #extractRetryAfter(error) {
    const retryAfterHeader = Number(error?.rawError?.retry_after ?? error?.retry_after ?? error?.data?.retry_after);
    if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
      return Math.ceil(retryAfterHeader * 1000);
    }

    const resetAfter = Number(error?.requestBody?.json?.retry_after);
    if (Number.isFinite(resetAfter) && resetAfter > 0) {
      return Math.ceil(resetAfter * 1000);
    }

    return 0;
  }

  async #sendWithOptionalRetry(callable) {
    try {
      return await callable();
    } catch (error) {
      if (!this.bot.ops?.retryOnRateLimit || !Context.#isRateLimitError(error)) {
        throw error;
      }

      const retryMs = Context.#extractRetryAfter(error);
      // Bound retries to short windows to avoid hanging command execution paths.
      if (!retryMs || retryMs > 10_000) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryMs));
      return callable();
    }
  }

  async send(payload) {
    if (this.data instanceof DJS.Message) {
      return this.#sendWithOptionalRetry(() => this.data.channel.send(payload));
    }

    if (this.data.isAutocomplete?.()) {
      throw new Error("Autocomplete interactions cannot send message replies. Use interaction.respond() instead.");
    }

    const replyPayload =
      typeof payload === "string"
        ? { content: payload }
        : payload && typeof payload === "object"
        ? payload
        : { content: String(payload ?? "") };

    if (this.data.deferred || this.data.replied) {
      return this.#sendWithOptionalRetry(() => this.data.editReply(replyPayload));
    }

    return this.#sendWithOptionalRetry(() => this.data.reply(replyPayload));
  }

  async react(...emojis) {
    if (!(this.data instanceof DJS.Message)) return undefined;

    let lastReaction;
    for (const emoji of emojis) {
      lastReaction = await this.data.react(emoji);
    }

    return lastReaction;
  }

  get(param) {
    const lowered = param.toLowerCase();

    if (this.params?.length) {
      return this.params.find((entry) => entry.name.toLowerCase() === lowered)?.value ?? null;
    }

    if (this.data instanceof DJS.Message) return null;

    const option = this.data.options?.data?.find((entry) => entry.name.toLowerCase() === lowered);
    if (!option) return null;

    return option.attachment ?? option.member ?? option.channel ?? option.role ?? option.user ?? option.value ?? null;
  }
}
exports.Context = Context;
