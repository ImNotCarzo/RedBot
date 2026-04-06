"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandBuilder = exports.validateDefaultMemberPermissions = void 0;

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

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      default_member_permissions: this.defaultMemberPermissions ? validateDefaultMemberPermissions(this.defaultMemberPermissions) : undefined,
      dm_permission: typeof this.guildOnly === "boolean" ? !this.guildOnly : undefined,
    };
  }
}
exports.CommandBuilder = CommandBuilder;
