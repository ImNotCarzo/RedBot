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

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      options: [],
      default_member_permissions: this.defaultMemberPermissions
        ? (0, CommandBuilder_js_1.validateDefaultMemberPermissions)(this.defaultMemberPermissions)
        : undefined,
      dm_permission: typeof this.guildOnly === "boolean" ? !this.guildOnly : undefined,
    };
  }
}
exports.GroupBuilder = GroupBuilder;
