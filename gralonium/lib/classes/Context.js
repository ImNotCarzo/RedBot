"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Context = void 0;

const tslib_1 = require("tslib");
const DJS = tslib_1.__importStar(require("discord.js"));
const ComponentsV2Builder_js_1 = require("./builders/ComponentsV2Builder.js");
const helpers_js_1 = require("./builders/components/helpers.js");

class Context {
  bot;
  args;
  data;
  prefix = "";
  isEditedMessage = false;
  command;
  parent = null;
  params;
  #prefixThinkingMessage = null;
  #prefixThinkingIsV2 = false;
  #deferredEphemeral = false;

  constructor(bot, data) {
    this.bot = bot;
    this.data = data;
    this.command = null;
    this.params = [];
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

  get user() {
    return this.author;
  }

  get isPrefix() {
    return this.data instanceof DJS.Message;
  }

  get isInteraction() {
    return !(this.data instanceof DJS.Message);
  }

  get isSlash() {
    return (
      !(this.data instanceof DJS.Message) &&
      (typeof this.data.isChatInputCommand !== "function" || this.data.isChatInputCommand())
    );
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

  static #detectV2Payload(payload) {
    if (!payload || typeof payload !== "object") return false;
    const v2Flag = DJS.MessageFlags?.IsComponentsV2;
    if (v2Flag !== undefined) {
      if (typeof payload.flags === "number" && (payload.flags & v2Flag) === v2Flag) return true;
      if (typeof payload.flags?.has === "function" && payload.flags.has(v2Flag)) return true;
    }
    if (Array.isArray(payload.components)) {
      return payload.components.some((c) => helpers_js_1.isV2ComponentType((c?.data ?? c)?.type));
    }
    return false;
  }

  static #assertV2Compatibility(payload) {
    const hasContent = payload.content !== undefined && payload.content !== null && payload.content !== "";
    const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
    const hasStickers = Array.isArray(payload.stickers) && payload.stickers.length > 0;
    const hasPoll = payload.poll !== undefined && payload.poll !== null;

    if (hasContent || hasEmbeds || hasStickers || hasPoll) {
      throw new Error(
        "[Context] Payloads using MessageFlags.IsComponentsV2 cannot include content, embeds, stickers, or poll."
      );
    }
  }

  static #hasEphemeralFlag(payload) {
    const eph = DJS.MessageFlags?.Ephemeral;
    if (payload?.ephemeral) return true;
    if (eph === undefined) return false;
    if (typeof payload?.flags === "number" && (payload.flags & eph) === eph) return true;
    if (typeof payload?.flags?.has === "function" && payload.flags.has(eph)) return true;
    return false;
  }

  static #stripEphemeralForMessage(payload) {
    if (!payload || typeof payload !== "object" || payload instanceof DJS.MessagePayload) return;
    if ("ephemeral" in payload) {
      delete payload.ephemeral;
    }
    const eph = DJS.MessageFlags?.Ephemeral;
    if (eph === undefined || payload.flags === undefined || payload.flags === null) return;

    if (typeof payload.flags === "number") {
      payload.flags = payload.flags & ~eph;
      if (payload.flags === 0) delete payload.flags;
    } else if (Array.isArray(payload.flags)) {
      payload.flags = payload.flags.filter((f) => f !== eph && f !== "Ephemeral");
      if (payload.flags.length === 0) delete payload.flags;
    } else if (typeof payload.flags?.remove === "function") {
      payload.flags = payload.flags.remove(eph);
    }
  }

  #normalizePayload(payload, options = {}) {
    if (payload instanceof DJS.MessagePayload) {
      return { normalized: payload, isV2: Context.#detectV2Payload(payload.options), wantsEphemeral: Boolean(options.ephemeral) };
    }

    let normalized;
    if (ComponentsV2Builder_js_1.ComponentsV2Builder.isBuilder(payload)) {
      normalized = payload.toPayload({
        ephemeral: options.ephemeral,
        suppressNotifications: options.suppressNotifications,
        safeMentions: options.safeMentions,
        allowedMentions: options.allowedMentions,
        files: options.files,
      });
    } else if (typeof payload === "string") {
      normalized = { content: payload };
    } else if (payload && typeof payload === "object") {
      normalized = { ...payload };
    } else {
      normalized = { content: String(payload ?? "") };
    }

    if (options.allowedMentions !== undefined && normalized.allowedMentions === undefined) {
      normalized.allowedMentions = options.allowedMentions;
    }
    if (options.files !== undefined && normalized.files === undefined) {
      normalized.files = options.files;
    }
    if (options.ephemeral === true && DJS.MessageFlags?.Ephemeral !== undefined) {
      if (typeof normalized.flags === "number") {
        normalized.flags |= DJS.MessageFlags.Ephemeral;
      } else if (normalized.flags === undefined) {
        normalized.flags = DJS.MessageFlags.Ephemeral;
      }
    }

    const isV2 = Context.#detectV2Payload(normalized);
    if (isV2) {
      if (typeof normalized.flags === "number") {
        normalized.flags |= DJS.MessageFlags.IsComponentsV2;
      } else if (normalized.flags === undefined) {
        normalized.flags = DJS.MessageFlags.IsComponentsV2;
      }
      Context.#assertV2Compatibility(normalized);
    }

    const wantsEphemeral = Boolean(options.ephemeral || Context.#hasEphemeralFlag(normalized));
    return { normalized, isV2, wantsEphemeral };
  }

  /**
   * Defers the interaction reply (respecting `ephemeral`) or optionally sends a
   * thinking placeholder in prefix command mode.
   */
  async defer(options = {}) {
    if (this.data instanceof DJS.Message) {
      if (options.thinking) {
        const placeholder = new ComponentsV2Builder_js_1.ComponentsV2Builder({
          color: options.color ?? null,
        }).addText(options.thinkingText || "⏳ Procesando...");

        const sent = await this.send(placeholder, {
          reply: options.reply,
          allowedMentions: options.allowedMentions,
        });
        this.#prefixThinkingMessage = sent || null;
        this.#prefixThinkingIsV2 = true;
        return this.#prefixThinkingMessage;
      }
      if (options.typing !== false) {
        await this.data.channel?.sendTyping?.().catch(() => null);
      }
      return null;
    }

    if (this.data.isAutocomplete?.()) {
      throw new Error("Autocomplete interactions cannot be deferred.");
    }

    if (this.data.deferred || this.data.replied) {
      return null;
    }

    let flags = typeof options.flags === "number" ? options.flags : 0;
    if (options.ephemeral && DJS.MessageFlags?.Ephemeral !== undefined) {
      flags |= DJS.MessageFlags.Ephemeral;
    }

    this.#deferredEphemeral = Boolean(
      options.ephemeral || (DJS.MessageFlags?.Ephemeral !== undefined && (flags & DJS.MessageFlags.Ephemeral) !== 0)
    );

    const deferOptions = flags ? { flags } : {};
    return this.#sendWithOptionalRetry(() => this.data.deferReply(deferOptions));
  }

  /**
   * Sends a reply in both prefix (`Message`) and slash/interaction modes.
   * Accepts strings, message option objects, or `ComponentsV2Builder` instances.
   */
  async send(payload, options = {}) {
    const { normalized, isV2, wantsEphemeral } = this.#normalizePayload(payload, options);

    if (this.data instanceof DJS.Message) {
      Context.#stripEphemeralForMessage(normalized);

      if (this.#prefixThinkingMessage) {
        const thinkingMsg = this.#prefixThinkingMessage;
        const thinkingWasV2 = this.#prefixThinkingIsV2;
        this.#prefixThinkingMessage = null;
        this.#prefixThinkingIsV2 = false;

        const hasPoll = Boolean(normalized && typeof normalized === "object" && normalized.poll !== undefined);
        if (thinkingWasV2 === isV2 && !hasPoll && typeof thinkingMsg.edit === "function") {
          const editData = normalized instanceof DJS.MessagePayload ? normalized : { ...normalized };
          if (editData && typeof editData === "object" && "reply" in editData) {
            delete editData.reply;
          }
          try {
            return await this.#sendWithOptionalRetry(() => thinkingMsg.edit(editData));
          } catch {
            // Fall through to sending a fresh message if placeholder can no longer be edited.
          }
        } else if (typeof thinkingMsg.delete === "function") {
          await thinkingMsg.delete().catch(() => null);
        }
      }

      const shouldReply = Boolean(options.reply ?? normalized?.reply ?? this.bot?.ops?.replyOnPrefix);
      if (shouldReply && !(normalized instanceof DJS.MessagePayload)) {
        if (!normalized.reply && this.data.id) {
          normalized.reply = { messageReference: this.data.id, failIfNotExists: false };
        }
        if (normalized.allowedMentions === undefined) {
          normalized.allowedMentions = { parse: [], repliedUser: false };
        }
        if (typeof this.data.reply === "function" && !options.forceChannelSend) {
          const replyObj = { ...normalized };
          delete replyObj.reply;
          return this.#sendWithOptionalRetry(() => this.data.reply(replyObj));
        }
      }

      return this.#sendWithOptionalRetry(() => this.data.channel.send(normalized));
    }

    if (this.data.isAutocomplete?.()) {
      throw new Error("Autocomplete interactions cannot send message replies. Use interaction.respond() instead.");
    }

    if (this.data.deferred || this.data.replied) {
      const wasPublicDefer = !this.#deferredEphemeral && !this.data.ephemeral;
      if (wantsEphemeral && wasPublicDefer) {
        if (this.data.deferred && !this.data.replied && typeof this.data.deleteReply === "function") {
          await this.data.deleteReply().catch(() => null);
        }
        return this.#sendWithOptionalRetry(() => this.data.followUp(normalized));
      }

      if (options.followUp) {
        return this.#sendWithOptionalRetry(() => this.data.followUp(normalized));
      }

      return this.#sendWithOptionalRetry(() => this.data.editReply(normalized));
    }

    return this.#sendWithOptionalRetry(() => this.data.reply(normalized));
  }

  /**
   * Sends a message quoting the invoking message when in prefix mode.
   */
  async reply(payload, options = {}) {
    return this.send(payload, { ...options, reply: true });
  }

  /**
   * Sends an ephemeral message on interactions, automatically stripping the
   * Ephemeral flag when executed from a prefix message command.
   */
  async ephemeral(payload, options = {}) {
    return this.send(payload, { ...options, ephemeral: true });
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
