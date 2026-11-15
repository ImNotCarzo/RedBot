"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupBuilder = void 0;

const CommandBuilder_js_1 = require("./CommandBuilder.js");
const shapeshift_1 = require("@sapphire/shapeshift");

const permissionStringPredicate = shapeshift_1.s.string.lengthGreaterThan(0);
const permissionArrayPredicate = shapeshift_1.s.array(permissionStringPredicate);

class GroupBuilder {
  name;
  aliases;
  description;
  commands;
  as_slash;
  as_prefix;
  guildOnly;
  defaultMemberPermissions;
  userPermissions;
  botPermissions;
  guards;
  integrationTypes;
  contexts;
  nameLocalizations;
  descriptionLocalizations;

  constructor(options) {
    this.commands = [];
    this.name = options?.name ?? "";
    this.aliases = options?.aliases ?? [];
    this.description = options?.description ?? "...";
    this.as_prefix = options?.as_prefix ?? true;
    this.as_slash = options?.as_slash ?? true;
    this.guildOnly = options?.guildOnly;
    this.defaultMemberPermissions = options?.defaultMemberPermissions;
    this.userPermissions = permissionArrayPredicate.parse(options?.userPermissions ?? []);
    this.botPermissions = permissionArrayPredicate.parse(options?.botPermissions ?? []);
    this.guards = options?.guards ?? [];
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

  addCommand(command) {
    this.commands.push(command);
    return this;
  }

  setGuards(...guards) {
    this.guards = guards;
    return this;
  }

  setUserPermissions(...permissions) {
    this.userPermissions = permissionArrayPredicate.parse(permissions);
    return this;
  }

  setBotPermissions(...permissions) {
    this.botPermissions = permissionArrayPredicate.parse(permissions);
    return this;
  }

  allowPrefix(allow) {
    this.as_prefix = allow;
    return this;
  }

  allowSlash(allow) {
    this.as_slash = allow;
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

  setNameLocalizations(locales) {
    this.nameLocalizations = (0, CommandBuilder_js_1.normalizeNameLocalizations)(locales);
    return this;
  }

  setDescriptionLocalizations(locales) {
    this.descriptionLocalizations = (0, CommandBuilder_js_1.normalizeDescriptionLocalizations)(locales);
    return this;
  }

  toJSON() {
    return {
      name: this.name,
      description: String(this.description ?? "...").slice(0, 100),
      options: [],
      default_member_permissions: this.defaultMemberPermissions
        ? (0, CommandBuilder_js_1.validateDefaultMemberPermissions)(this.defaultMemberPermissions)
        : undefined,
      dm_permission: typeof this.guildOnly === "boolean" ? !this.guildOnly : undefined,
      ...(this.nameLocalizations ? { name_localizations: this.nameLocalizations } : {}),
      ...(this.descriptionLocalizations ? { description_localizations: this.descriptionLocalizations } : {}),
      ...(this.integrationTypes !== undefined ? { integration_types: this.integrationTypes } : {}),
      ...(this.contexts !== undefined ? { contexts: this.contexts } : {}),
    };
  }
}
exports.GroupBuilder = GroupBuilder;
