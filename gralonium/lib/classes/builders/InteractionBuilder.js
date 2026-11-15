"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionBuilder = exports.Interactions = void 0;

const discord_js_1 = require("discord.js");
const CommandBuilder_js_1 = require("./CommandBuilder.js");

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
 * Supports exact `name`/`customId` matching, `prefix` / `match` routing,
 * localizations, and context-menu application command metadata.
 */
class InteractionBuilder {
  name;
  type;
  description;
  prefix;
  match;
  as_command;
  guildOnly;
  defaultMemberPermissions;
  integrationTypes;
  contexts;
  nameLocalizations;
  descriptionLocalizations;

  constructor(options) {
    this.name = options?.name;
    this.type = options?.type || Interactions.ChatInput;
    this.description = options?.description || "...";
    this.prefix = options?.prefix;
    this.match = options?.match;
    this.as_command = options?.as_command ?? true;
    this.guildOnly = options?.guildOnly;
    this.defaultMemberPermissions = options?.defaultMemberPermissions;
    this.integrationTypes = options?.integrationTypes;
    this.contexts = options?.contexts;
    this.nameLocalizations = (0, CommandBuilder_js_1.normalizeNameLocalizations)(
      options?.nameLocalizations ?? options?.name_localizations
    );
    this.descriptionLocalizations = (0, CommandBuilder_js_1.normalizeDescriptionLocalizations)(
      options?.descriptionLocalizations ?? options?.description_localizations
    );
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

  setNameLocalizations(locales) {
    this.nameLocalizations = (0, CommandBuilder_js_1.normalizeNameLocalizations)(locales);
    return this;
  }

  setDescriptionLocalizations(locales) {
    this.descriptionLocalizations = (0, CommandBuilder_js_1.normalizeDescriptionLocalizations)(locales);
    return this;
  }

  setIntegrationTypes(...types) {
    this.integrationTypes = types.flat();
    return this;
  }

  setContexts(...contexts) {
    this.contexts = contexts.flat();
    return this;
  }

  setDefaultMemberPermissions(permissions) {
    this.defaultMemberPermissions = permissions;
    return this;
  }

  setGuildOnly(guildOnly = true) {
    this.guildOnly = Boolean(guildOnly);
    return this;
  }

  allowCommand(allow = true) {
    this.as_command = Boolean(allow);
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
      description: String(this.description ?? "...").slice(0, 100),
      ...(this.defaultMemberPermissions !== undefined
        ? {
            default_member_permissions: (0, CommandBuilder_js_1.validateDefaultMemberPermissions)(
              this.defaultMemberPermissions
            ),
          }
        : {}),
      ...(typeof this.guildOnly === "boolean" ? { dm_permission: !this.guildOnly } : {}),
      ...(this.prefix !== undefined ? { prefix: this.prefix } : {}),
      ...(this.nameLocalizations ? { name_localizations: this.nameLocalizations } : {}),
      ...(this.descriptionLocalizations ? { description_localizations: this.descriptionLocalizations } : {}),
      ...(this.integrationTypes !== undefined ? { integration_types: this.integrationTypes } : {}),
      ...(this.contexts !== undefined ? { contexts: this.contexts } : {}),
    };
  }

  /**
   * Builds the Discord application command payload for context menu commands (`type: 2` / `type: 3`).
   */
  toCommandJSON() {
    if (this.as_command === false) {
      return null;
    }

    const commandType =
      this.type === Interactions.UserContextMenu
        ? discord_js_1.ApplicationCommandType.User
        : this.type === Interactions.MessageContextMenu
        ? discord_js_1.ApplicationCommandType.Message
        : discord_js_1.ApplicationCommandType.ChatInput;

    const payload = {
      name: this.name,
      type: commandType,
      ...(this.defaultMemberPermissions !== undefined
        ? {
            default_member_permissions: (0, CommandBuilder_js_1.validateDefaultMemberPermissions)(
              this.defaultMemberPermissions
            ),
          }
        : {}),
      ...(typeof this.guildOnly === "boolean" ? { dm_permission: !this.guildOnly } : {}),
      ...(this.nameLocalizations ? { name_localizations: this.nameLocalizations } : {}),
      ...(this.integrationTypes !== undefined ? { integration_types: this.integrationTypes } : {}),
      ...(this.contexts !== undefined ? { contexts: this.contexts } : {}),
    };

    if (commandType === discord_js_1.ApplicationCommandType.ChatInput) {
      payload.description = String(this.description ?? "...").slice(0, 100);
      if (this.descriptionLocalizations) {
        payload.description_localizations = this.descriptionLocalizations;
      }
    }

    return payload;
  }
}

exports.InteractionBuilder = InteractionBuilder;
