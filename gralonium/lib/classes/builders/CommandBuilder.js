"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandBuilder = exports.normalizeDescriptionLocalizations = exports.normalizeNameLocalizations = exports.validateDefaultMemberPermissions = void 0;

const shapeshift_1 = require("@sapphire/shapeshift");

const memberPermissionPredicate = shapeshift_1.s
  .union(shapeshift_1.s.bigint.transform((value) => value.toString()), shapeshift_1.s.number.safeInt.transform((value) => value.toString()), shapeshift_1.s.string.regex(/^\d+$/))
  .nullish;
const permissionStringPredicate = shapeshift_1.s.string.lengthGreaterThan(0);
const permissionArrayPredicate = shapeshift_1.s.array(permissionStringPredicate);

function validateDefaultMemberPermissions(permissions) {
  return memberPermissionPredicate.parse(permissions);
}
exports.validateDefaultMemberPermissions = validateDefaultMemberPermissions;

function normalizeLocaleMap(map, maxLength) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return undefined;
  const out = {};
  let hasEntries = false;
  for (const [locale, raw] of Object.entries(map)) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    out[locale] = trimmed.slice(0, maxLength);
    hasEntries = true;
  }
  return hasEntries ? out : undefined;
}

/**
 * Normalizes a localization map for Discord command/option names (max 32 chars).
 */
function normalizeNameLocalizations(map) {
  return normalizeLocaleMap(map, 32);
}
exports.normalizeNameLocalizations = normalizeNameLocalizations;

/**
 * Normalizes a localization map for Discord descriptions (max 100 chars).
 */
function normalizeDescriptionLocalizations(map) {
  return normalizeLocaleMap(map, 100);
}
exports.normalizeDescriptionLocalizations = normalizeDescriptionLocalizations;

class CommandBuilder {
  name;
  aliases;
  description;
  as_prefix;
  as_slash;
  fallback;
  guildOnly;
  multiple_args;
  defaultMemberPermissions;
  userPermissions;
  botPermissions;
  guards;
  cooldown;
  integrationTypes;
  contexts;
  nameLocalizations;
  descriptionLocalizations;

  constructor(options) {
    this.name = options?.name ?? "";
    this.aliases = options?.aliases ?? [];
    this.description = options?.description ?? "...";
    this.fallback = options?.fallback ?? false;
    this.as_prefix = options?.as_prefix ?? true;
    this.as_slash = options?.as_slash ?? true;
    this.guildOnly = options?.guildOnly;
    this.defaultMemberPermissions = options?.defaultMemberPermissions;
    this.userPermissions = permissionArrayPredicate.parse(options?.userPermissions ?? []);
    this.botPermissions = permissionArrayPredicate.parse(options?.botPermissions ?? []);
    this.guards = options?.guards ?? [];
    this.cooldown = options?.cooldown;
    this.integrationTypes = options?.integrationTypes;
    this.contexts = options?.contexts;
    this.nameLocalizations = normalizeNameLocalizations(options?.nameLocalizations ?? options?.name_localizations);
    this.descriptionLocalizations = normalizeDescriptionLocalizations(
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

  setAliases(...aliases) {
    this.aliases = aliases;
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

  allowMultipleArgs(allow) {
    this.multiple_args = allow;
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

  setCooldown(seconds, bucket = "USER") {
    this.cooldown = { seconds, bucket };
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
    this.nameLocalizations = normalizeNameLocalizations(locales);
    return this;
  }

  setDescriptionLocalizations(locales) {
    this.descriptionLocalizations = normalizeDescriptionLocalizations(locales);
    return this;
  }

  toJSON() {
    return {
      name: this.name,
      description: String(this.description ?? "...").slice(0, 100),
      default_member_permissions: this.defaultMemberPermissions ? validateDefaultMemberPermissions(this.defaultMemberPermissions) : undefined,
      dm_permission: typeof this.guildOnly === "boolean" ? !this.guildOnly : undefined,
      ...(this.nameLocalizations ? { name_localizations: this.nameLocalizations } : {}),
      ...(this.descriptionLocalizations ? { description_localizations: this.descriptionLocalizations } : {}),
      ...(this.integrationTypes !== undefined ? { integration_types: this.integrationTypes } : {}),
      ...(this.contexts !== undefined ? { contexts: this.contexts } : {}),
    };
  }
}
exports.CommandBuilder = CommandBuilder;
