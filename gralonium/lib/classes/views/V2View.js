"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2View = void 0;

const crypto_1 = require("crypto");
const discord_js_1 = require("discord.js");
const ComponentsV2Builder_js_1 = require("../builders/ComponentsV2Builder.js");
const helpers_js_1 = require("../builders/components/helpers.js");

function shortPrefix() {
  if (typeof crypto_1.randomBytes === "function") {
    return `v2_${crypto_1.randomBytes(4).toString("hex")}`;
  }
  return `v2_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultCloneState(state) {
  if (state === null || typeof state !== "object") return state;
  if (Array.isArray(state)) return [...state];
  return { ...state };
}

function normalizeMessageTarget(target) {
  if (!target) return null;
  if (target.resource?.message) return target.resource.message;
  return target;
}

/**
 * Interactive session controller for Discord Components V2 messages.
 * Provides scoped custom IDs, reactive state rendering, unified component collection,
 * third-party handling (`reject`, `allow`, `ephemeral-view`), and clean teardown (`disable`, `static`, `delete`).
 */
class V2View {
  #idPrefix;
  #authorId;
  #state;
  #cloneState;
  #render;
  #actions = new Map();
  #defaultAction = null;
  #timeout;
  #idle;
  #thirdPartyMode;
  #thirdPartyMessage;
  #onEnd;
  #onEndHandler;
  #renderStatic;
  #isEphemeral;
  #filter;
  #collector = null;
  #message = null;
  #stopped = false;
  #endHandled = false;

  constructor(options = {}) {
    this.#idPrefix = String(options.idPrefix || shortPrefix());
    this.#authorId = options.author?.id ?? options.authorId ?? options.ownerId ?? null;
    this.#cloneState = typeof options.cloneState === "function" ? options.cloneState : defaultCloneState;
    this.#state = this.#cloneState(options.state ?? {});
    this.#render = typeof options.render === "function" ? options.render : null;
    this.#renderStatic = typeof options.renderStatic === "function" ? options.renderStatic : null;

    if (options.timeoutSeconds !== undefined) {
      this.#timeout = Math.max(1000, Number(options.timeoutSeconds) * 1000);
    } else if (options.time !== undefined) {
      this.#timeout = Math.max(1000, Number(options.time));
    } else if (options.timeout !== undefined) {
      this.#timeout = Math.max(1000, Number(options.timeout));
    } else {
      this.#timeout = 120_000;
    }

    this.#idle = options.idle !== undefined ? Number(options.idle) : undefined;
    this.#thirdPartyMode = options.thirdPartyMode || (this.#authorId ? "reject" : "allow");
    this.#thirdPartyMessage = options.thirdPartyMessage || "Esta vista interactiva pertenece a otro usuario.";
    this.#onEnd = options.onEnd || "disable";
    this.#onEndHandler = typeof options.onEndHandler === "function" ? options.onEndHandler : null;
    this.#isEphemeral = Boolean(options.isEphemeral);
    this.#filter = typeof options.filter === "function" ? options.filter : null;

    if (options.actions && typeof options.actions === "object") {
      for (const [name, handler] of Object.entries(options.actions)) {
        if (typeof handler === "function") {
          this.#actions.set(name, handler);
        }
      }
    }
    if (typeof options.onAction === "function") {
      this.#defaultAction = options.onAction;
    }
  }

  get idPrefix() {
    return this.#idPrefix;
  }

  get authorId() {
    return this.#authorId;
  }

  get state() {
    return this.#state;
  }

  get message() {
    return this.#message;
  }

  get collector() {
    return this.#collector;
  }

  get isEnded() {
    return this.#stopped;
  }

  get isEphemeral() {
    return this.#isEphemeral;
  }

  /**
   * Builds a scoped `customId` belonging to this view (`<prefix>:<action>` or `<prefix>:<action>:<extra>`).
   */
  id(action, ...extra) {
    const base = `${this.#idPrefix}:${action}`;
    const rest = extra.filter((part) => part !== undefined && part !== null && part !== "");
    return rest.length > 0 ? `${base}:${rest.join(":")}` : base;
  }

  /**
   * Alias of `id(action, ...extra)`.
   */
  scopedId(action, ...extra) {
    return this.id(action, ...extra);
  }

  setState(updater) {
    if (typeof updater === "function") {
      const next = updater(this.#state);
      if (next !== undefined) this.#state = next;
    } else if (updater && typeof updater === "object") {
      this.#state = { ...(this.#state && typeof this.#state === "object" ? this.#state : {}), ...updater };
    }
    return this;
  }

  setRenderer(renderFn) {
    this.#render = renderFn;
    return this;
  }

  on(action, handler) {
    this.#actions.set(String(action), handler);
    return this;
  }

  action(action, handler) {
    return this.on(action, handler);
  }

  #parseScopedCustomId(customId) {
    if (typeof customId !== "string") return null;
    const prefixWithSep = `${this.#idPrefix}:`;
    if (!customId.startsWith(prefixWithSep)) return null;
    const remainder = customId.slice(prefixWithSep.length);
    const colonIdx = remainder.indexOf(":");
    if (colonIdx === -1) {
      return { action: remainder, subId: null, parts: [] };
    }
    const action = remainder.slice(0, colonIdx);
    const rawSub = remainder.slice(colonIdx + 1);
    return { action, subId: rawSub, parts: rawSub.split(":") };
  }

  #renderWithState(stateOverride = this.#state, extraCtx = {}) {
    if (!this.#render) {
      throw new Error("[V2View] A render function is required.");
    }
    return this.#render({
      state: stateOverride,
      view: this,
      id: (action, ...rest) => this.id(action, ...rest),
      scopedId: (action, ...rest) => this.id(action, ...rest),
      ownerId: this.#authorId,
      isEphemeral: this.#isEphemeral,
      isEnded: this.#stopped,
      ...extraCtx,
    });
  }

  /**
   * Renders the current view state into a ready-to-send Discord message payload.
   */
  toPayload(options = {}) {
    const rendered = options.static && this.#renderStatic
      ? this.#renderStatic({ state: this.#state, view: this, isEnded: true, isEphemeral: this.#isEphemeral })
      : this.#renderWithState(this.#state, { isEnded: Boolean(options.isEnded ?? this.#stopped) });

    if (ComponentsV2Builder_js_1.ComponentsV2Builder.isBuilder(rendered)) {
      return rendered.toPayload({
        ephemeral: options.ephemeral ?? this.#isEphemeral,
        safeMentions: options.safeMentions,
        allowedMentions: options.allowedMentions,
        files: options.files,
      });
    }
    return rendered;
  }

  /**
   * Stops the view collector (if active) and applies the configured end behavior.
   */
  stop(reason = "stopped") {
    this.#stopped = true;
    if (this.#collector && !this.#collector.ended) {
      this.#collector.stop(reason);
    }
    return this;
  }

  async #spawnEphemeralSession(interaction, parsed) {
    const subView = new V2View({
      authorId: interaction.user?.id,
      state: this.#cloneState(this.#state),
      cloneState: this.#cloneState,
      render: this.#render,
      renderStatic: this.#renderStatic,
      timeout: this.#timeout,
      idle: this.#idle,
      thirdPartyMode: "reject",
      thirdPartyMessage: this.#thirdPartyMessage,
      onEnd: this.#onEnd === "delete" ? "disable" : this.#onEnd,
      isEphemeral: true,
      onAction: this.#defaultAction,
    });

    for (const [name, fn] of this.#actions.entries()) {
      subView.on(name, fn);
    }

    const actionCtx = subView.#createActionContext(interaction, parsed);
    const handler = subView.#actions.get(parsed.action) || subView.#defaultAction;
    if (handler) {
      await handler(actionCtx);
    }

    if (interaction.replied || interaction.deferred) {
      return;
    }

    const payload = subView.toPayload({ ephemeral: true });
    let replyResult = null;
    try {
      replyResult = await interaction.reply({ ...payload, withResponse: true });
    } catch {
      replyResult = await interaction.reply(payload);
    }

    const ephemeralMsg = normalizeMessageTarget(replyResult);
    if (ephemeralMsg && typeof ephemeralMsg.createMessageComponentCollector === "function") {
      subView.attach(ephemeralMsg);
    }
  }

  #createActionContext(interaction, parsed) {
    return {
      interaction,
      state: this.#state,
      setState: (updater) => this.setState(updater),
      view: this,
      action: parsed.action,
      subId: parsed.subId,
      parts: parsed.parts,
      customId: interaction.customId,
      values: Array.isArray(interaction.values) ? interaction.values : [],
      isEphemeral: this.#isEphemeral,
      stop: (reason) => this.stop(reason),
      id: (action, ...rest) => this.id(action, ...rest),
    };
  }

  async #handleInteraction(interaction) {
    const parsed = this.#parseScopedCustomId(interaction.customId);
    if (!parsed) return;

    if (this.#filter) {
      const allowed = await this.#filter(interaction, this);
      if (!allowed) return;
    }

    const userId = interaction.user?.id;
    const isOwner = !this.#authorId || !userId || userId === this.#authorId;

    if (!isOwner) {
      if (this.#thirdPartyMode === "ephemeral-view") {
        await this.#spawnEphemeralSession(interaction, parsed);
        return;
      }
      if (this.#thirdPartyMode !== "allow") {
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ content: this.#thirdPartyMessage, flags: discord_js_1.MessageFlags.Ephemeral })
            .catch(() => null);
        }
        return;
      }
    }

    const handler = this.#actions.get(parsed.action) || this.#defaultAction;
    if (!handler) return;

    const actionCtx = this.#createActionContext(interaction, parsed);
    const result = await handler(actionCtx);

    if (this.#stopped) {
      if (!interaction.replied && !interaction.deferred && typeof interaction.deferUpdate === "function") {
        await interaction.deferUpdate().catch(() => null);
      }
      return;
    }

    if (result === false || interaction.replied || interaction.deferred) {
      return;
    }

    const nextPayload = this.toPayload({ ephemeral: this.#isEphemeral });
    if (typeof interaction.update === "function") {
      await interaction.update(nextPayload);
    } else if (this.#message?.editable) {
      await this.#message.edit(nextPayload);
    }
  }

  async #runEndBehavior(reason) {
    if (this.#endHandled) return;
    this.#endHandled = true;
    this.#stopped = true;

    if (this.#onEndHandler) {
      await this.#onEndHandler({ view: this, message: this.#message, reason, state: this.#state });
    }

    if (!this.#message || reason === "deleted") return;

    if (this.#onEnd === "delete") {
      if (typeof this.#message.delete === "function") {
        await this.#message.delete().catch(() => null);
      }
      return;
    }

    if (this.#onEnd === "static") {
      if (this.#renderStatic && this.#message.editable) {
        const staticPayload = this.toPayload({ static: true, isEnded: true, ephemeral: this.#isEphemeral });
        await this.#message.edit(staticPayload).catch(() => null);
        return;
      }
      await helpers_js_1.disableMessageComponents(this.#message);
      return;
    }

    if (this.#onEnd === "disable") {
      await helpers_js_1.disableMessageComponents(this.#message);
    }
  }

  /**
   * Attaches a component collector directly to an existing Discord Message (or InteractionCallbackResponse).
   */
  attach(messageTarget, collectorOptions = {}) {
    const message = normalizeMessageTarget(messageTarget);
    if (!message || typeof message.createMessageComponentCollector !== "function") {
      throw new Error("[V2View] attach() requires a Discord Message with createMessageComponentCollector().");
    }

    this.#message = message;
    this.#stopped = false;
    this.#endHandled = false;

    const opts = {
      time: collectorOptions.time ?? this.#timeout,
      ...(collectorOptions.idle ?? this.#idle ? { idle: collectorOptions.idle ?? this.#idle } : {}),
      filter: (i) => Boolean(this.#parseScopedCustomId(i.customId)),
    };

    const collector = message.createMessageComponentCollector(opts);
    this.#collector = collector;

    collector.on("collect", async (interaction) => {
      try {
        await this.#handleInteraction(interaction);
      } catch (err) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ content: "Ocurrió un error al procesar esta acción.", flags: discord_js_1.MessageFlags.Ephemeral })
            .catch(() => null);
        }
        if (typeof collectorOptions.onError === "function") {
          collectorOptions.onError(err, interaction);
        }
      }
    });

    collector.on("end", async (_collected, reason) => {
      await this.#runEndBehavior(reason);
    });

    return collector;
  }

  /**
   * Renders and sends the view through a `Context` or `TextBasedChannel`, then attaches the collector automatically.
   */
  async send(target, sendOptions = {}) {
    const payload = this.toPayload({
      ephemeral: sendOptions.ephemeral ?? this.#isEphemeral,
      safeMentions: sendOptions.safeMentions,
      allowedMentions: sendOptions.allowedMentions,
      files: sendOptions.files,
    });

    let sent;
    if (target && typeof target.send === "function") {
      sent = await target.send(payload, sendOptions);
    } else {
      throw new TypeError("[V2View] send() requires a Context or TextBasedChannel with a .send() method.");
    }

    const message = normalizeMessageTarget(sent);
    const collector =
      message && typeof message.createMessageComponentCollector === "function" ? this.attach(message, sendOptions) : null;

    return { view: this, message, collector };
  }
}

exports.V2View = V2View;
