"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionBuilder = exports.Interactions = void 0;

var Interactions;
(function (Interactions) {
  Interactions.AnyInteraction = "anyInteraction";
  Interactions.Autocomplete = "autocomplete";
  Interactions.Button = "button";
  Interactions.ChatInput = "chatInput";
  Interactions.MessageContextMenu = "messageContextMenu";
  Interactions.Modal = "modalSubmit";
  Interactions.UserContextMenu = "userContextMenu";
  Interactions.ChannelSelectMenu = "channelSelectMenu";
  Interactions.RoleSelectMenu = "roleSelectMenu";
  Interactions.StringSelectMenu = "stringSelectMenu";
  Interactions.UserSelectMenu = "userSelectMenu";
  Interactions.MentionableSelectMenu = "mentionableSelectMenu";
})(Interactions || (exports.Interactions = Interactions = {}));

/**
 * Builder describing an interaction handler loaded by Gralonium.
 * Supports exact `name`/`customId` matching as well as `prefix` and `match` (RegExp or predicate).
 */
class InteractionBuilder {
  name;
  type;
  description;
  prefix;
  match;

  constructor(options) {
    this.name = options?.name;
    this.type = options?.type || Interactions.ChatInput;
    this.description = options?.description || "...";
    this.prefix = options?.prefix;
    this.match = options?.match;
  }

  setName(name) {
    this.name = name;
    return this;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  /**
   * Matches any interaction key (`customId` or `commandName`) starting with `prefix`.
   */
  setPrefix(prefix) {
    this.prefix = prefix;
    return this;
  }

  /**
   * Sets a RegExp or predicate `(key, interaction) => boolean` for dynamic interaction routing.
   */
  setMatcher(matcher) {
    this.match = matcher;
    return this;
  }

  /**
   * Returns true if this builder uses a dynamic prefix, RegExp, or predicate matcher.
   */
  hasPattern() {
    return Boolean(this.prefix || this.match);
  }

  /**
   * Evaluates whether a given interaction key (`customId` / `commandName`) matches this handler.
   */
  matches(key, interaction) {
    if (this.name !== undefined && this.name !== null && this.name !== "" && key === this.name) {
      return true;
    }
    if (this.prefix && typeof key === "string" && key.startsWith(this.prefix)) {
      return true;
    }
    if (this.match instanceof RegExp) {
      this.match.lastIndex = 0;
      return this.match.test(String(key ?? ""));
    }
    if (typeof this.match === "function") {
      return Boolean(this.match(key, interaction));
    }
    return false;
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      ...(this.prefix !== undefined ? { prefix: this.prefix } : {}),
    };
  }
}

exports.InteractionBuilder = InteractionBuilder;
