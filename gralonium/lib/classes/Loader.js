"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Loader = exports.Types = void 0;

const discord_js_1 = require("discord.js");
const fs_1 = require("fs");
const path_1 = require("path");
const process_1 = require("process");
const crypto_1 = require("crypto");
const Client_js_1 = require("./Client.js");
const CommandBuilder_js_1 = require("./builders/CommandBuilder.js");
const GroupBuilder_js_1 = require("./builders/GroupBuilder.js");
const EventBuilder_js_1 = require("./builders/EventBuilder.js");
const InteractionBuilder_js_1 = require("./builders/InteractionBuilder.js");

const isValidFile = (file) => {
  if (file.endsWith(".d.ts")) return false;
  return file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".ts") || file.endsWith(".mts");
};

var Types;
(function (Types) {
  Types["Normal"] = "normal";
  Types["Group"] = "group";
})(Types || (exports.Types = Types = {}));

class Loader {
  client;
  commands;
  interactions;
  globalPlugins;
  listeners;
  rest;
  #eventHandlers;
  #loadedSignature;

  constructor(options) {
    if (!(options?.client instanceof Client_js_1.Enire)) {
      throw new SyntaxError("Invalid client provided in options");
    }

    this.client = options.client;
    this.commands = { normal: null, group: null };
    this.interactions = {
      autocomplete: new discord_js_1.Collection(),
      button: new discord_js_1.Collection(),
      chatInput: new discord_js_1.Collection(),
      modalSubmit: new discord_js_1.Collection(),
      userContextMenu: new discord_js_1.Collection(),
      messageContextMenu: new discord_js_1.Collection(),
      channelSelectMenu: new discord_js_1.Collection(),
      roleSelectMenu: new discord_js_1.Collection(),
      stringSelectMenu: new discord_js_1.Collection(),
      userSelectMenu: new discord_js_1.Collection(),
      mentionableSelectMenu: new discord_js_1.Collection(),
      anyInteraction: new discord_js_1.Collection(),
    };
    this.globalPlugins = [];
    this.listeners = null;
    this.rest = new discord_js_1.REST();
    this.#eventHandlers = new Map();
    this.#loadedSignature = new Set();
  }

  #toAbsolutePath(inputPath) {
    if ((0, path_1.isAbsolute)(inputPath)) return inputPath;
    return (0, path_1.join)((0, process_1.cwd)(), inputPath);
  }

  #collectModules(dirPath, reload, output) {
    const entries = (0, fs_1.readdirSync)(dirPath);

    for (const entry of entries) {
      const absolute = (0, path_1.join)(dirPath, entry);
      const stat = (0, fs_1.lstatSync)(absolute);

      if (stat.isDirectory()) {
        this.#collectModules(absolute, reload, output);
        continue;
      }

      if (!isValidFile(entry)) continue;

      if (reload) {
        try {
          delete require.cache[require.resolve(absolute)];
        } catch {
          /* ignore */
        }
      }

      const mod = require(absolute)?.data;
      if (!mod) continue;

      if (Array.isArray(mod)) output.push(...mod);
      else output.push(mod);
    }
  }

  #moduleSignature(moduleData) {
    const data = moduleData?.data;
    const type = data?.constructor?.name || "Unknown";
    const name = data?.name || "unknown";
    return `${type}:${name}`;
  }

  #assertUnique(moduleData) {
    const signature = this.#moduleSignature(moduleData);
    if (this.#loadedSignature.has(signature)) {
      throw new Error(`Duplicate module detected for ${signature}.`);
    }

    this.#loadedSignature.add(signature);
  }

  #assertValidModule(moduleData) {
    if (!moduleData?.data) {
      throw new Error("Invalid module: missing data builder.");
    }

    if (moduleData.data instanceof CommandBuilder_js_1.CommandBuilder || moduleData.data instanceof EventBuilder_js_1.EventBuilder || moduleData.data instanceof InteractionBuilder_js_1.InteractionBuilder) {
      if (typeof moduleData.code !== "function") {
        throw new Error(`Invalid module "${moduleData.data.name || "unknown"}": missing code function.`);
      }
    }

    if (moduleData.data instanceof CommandBuilder_js_1.CommandBuilder) {
      if (!moduleData.data.name) throw new Error("Invalid command module: name is required.");
      if (!moduleData.data.description) throw new Error(`Invalid command "${moduleData.data.name}": description is required.`);
    }

    if (moduleData.data instanceof GroupBuilder_js_1.GroupBuilder) {
      if (!moduleData.data.name) throw new Error("Invalid group module: name is required.");
      if (!Array.isArray(moduleData.data.commands)) {
        throw new Error(`Invalid group "${moduleData.data.name}": commands must be an array.`);
      }
    }
  }

  #attachEvent(moduleData) {
    const eventData = moduleData.data;
    const key = `${eventData.name}:${(0, crypto_1.randomUUID)()}`;
    const handler = (...args) => moduleData.code?.(this.client, ...args);

    this.#eventHandlers.set(key, { eventName: eventData.name, handler });

    if (eventData.once) this.client.once(eventData.name, handler);
    else this.client.on(eventData.name, handler);
  }

  #clearEventHandlers() {
    for (const { eventName, handler } of this.#eventHandlers.values()) {
      this.client.off(eventName, handler);
    }
    this.#eventHandlers.clear();
  }

  #resetCollectionsForReload() {
    this.commands = { normal: new discord_js_1.Collection(), group: new discord_js_1.Collection() };
    this.#loadedSignature.clear();

    for (const key of Object.keys(this.interactions)) {
      this.interactions[key].clear();
    }
  }

  #storeInteraction(moduleData) {
    const interaction = moduleData.data;

    switch (interaction.type) {
      case InteractionBuilder_js_1.Interactions.Autocomplete:
        this.interactions.autocomplete.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.Button:
        this.interactions.button.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.ChannelSelectMenu:
        this.interactions.channelSelectMenu.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.ChatInput:
        this.interactions.chatInput.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.MessageContextMenu:
        this.interactions.messageContextMenu.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.Modal:
        this.interactions.modalSubmit.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.RoleSelectMenu:
        this.interactions.roleSelectMenu.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.StringSelectMenu:
        this.interactions.stringSelectMenu.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.UserContextMenu:
        this.interactions.userContextMenu.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.UserSelectMenu:
        this.interactions.userSelectMenu.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.MentionableSelectMenu:
        this.interactions.mentionableSelectMenu.set(interaction.name, moduleData);
        break;
      case InteractionBuilder_js_1.Interactions.AnyInteraction:
        this.interactions.anyInteraction.set((0, crypto_1.randomUUID)(), moduleData);
        break;
      default:
        break;
    }
  }

  async load(dir, reload = false) {
    const modules = [];
    const absoluteDir = this.#toAbsolutePath(dir);

    if (!(0, fs_1.existsSync)(absoluteDir)) {
      throw new Error(`Path not found: ${absoluteDir}`);
    }

    if (reload) {
      this.#clearEventHandlers();
      this.#resetCollectionsForReload();
    } else {
      this.#loadedSignature.clear();
    }

    this.#collectModules(absoluteDir, reload, modules);

    for (const moduleData of modules) {
      this.#assertValidModule(moduleData);
      this.#assertUnique(moduleData);

      if (moduleData.data instanceof EventBuilder_js_1.EventBuilder) {
        this.#attachEvent(moduleData);
        continue;
      }

      if (moduleData.data instanceof InteractionBuilder_js_1.InteractionBuilder) {
        this.#storeInteraction(moduleData);
        continue;
      }

      if (moduleData.data instanceof CommandBuilder_js_1.CommandBuilder) {
        if (!this.commands.normal) this.commands.normal = new discord_js_1.Collection();
        this.commands.normal.set(moduleData.data.name, moduleData);
        continue;
      }

      if (moduleData.data instanceof GroupBuilder_js_1.GroupBuilder) {
        if (!this.commands.group) this.commands.group = new discord_js_1.Collection();
        this.commands.group.set(moduleData.data.name, moduleData);
      }
    }

    return modules;
  }

  walkCommands(sorter = () => 0) {
    const output = [];

    if (this.commands.normal) {
      output.push(...this.commands.normal.map((command) => ({ ...command, group: null })));
    }

    if (this.commands.group) {
      for (const group of this.commands.group.values()) {
        for (const command of group.data.commands) {
          output.push({ ...command, group });
        }
      }
    }

    return output.sort(sorter);
  }

  #buildTopLevelSlash(command) {
    const payload = { ...command.data.toJSON() };
    payload.options = command.params?.params || [];
    return payload;
  }

  #mergeGroupSlashPayload(payloads, groupRef, commandRef) {
    const groupJSON = { ...groupRef.data.toJSON() };
    const subCommandJSON = { ...commandRef.data.toJSON() };

    subCommandJSON.type = 1;
    subCommandJSON.options = commandRef.params?.params || [];

    if (subCommandJSON.default_member_permissions === undefined && groupJSON.default_member_permissions !== undefined) {
      subCommandJSON.default_member_permissions = groupJSON.default_member_permissions;
    }

    if (subCommandJSON.dm_permission === undefined && groupJSON.dm_permission !== undefined) {
      subCommandJSON.dm_permission = groupJSON.dm_permission;
    }

    const existingIndex = payloads.findIndex((entry) => entry.name === groupJSON.name && entry.type === 1);

    if (existingIndex >= 0) {
      payloads[existingIndex].options ||= [];
      if (payloads[existingIndex].options.some((entry) => entry.name === subCommandJSON.name)) {
        throw new Error(`Duplicate subcommand "${subCommandJSON.name}" in group "${groupJSON.name}".`);
      }
      payloads[existingIndex].options.push(subCommandJSON);
      return;
    }

    const groupPayload = {
      ...groupJSON,
      type: 1,
      options: [subCommandJSON],
    };

    payloads.push(groupPayload);
  }

  async sync(guildIDs) {
    if (!this.client.token) {
      throw new Error("Cannot sync application commands before login token is set.");
    }

    if (!this.client.user?.id) {
      throw new Error("Cannot sync application commands before client is ready.");
    }

    this.rest.setToken(this.client.token);

    const commands = this.walkCommands();
    const payload = [];
    const slashNames = new Set();

    for (const command of commands) {
      if (!command.data.as_slash) continue;

      if (!command.group) {
        const built = this.#buildTopLevelSlash(command);
        if (slashNames.has(built.name)) {
          throw new Error(`Duplicate slash command name detected during sync: ${built.name}`);
        }
        slashNames.add(built.name);
        payload.push(built);
        continue;
      }

      if (!command.group.data.as_slash) continue;
      this.#mergeGroupSlashPayload(payload, command.group, command);
    }

    if (!guildIDs?.length) {
      await this.rest.put(discord_js_1.Routes.applicationCommands(this.client.user.id), { body: payload });
      return;
    }

    for (const guildID of guildIDs) {
      await this.rest.put(discord_js_1.Routes.applicationGuildCommands(this.client.user.id, guildID), { body: payload });
    }
  }
}
exports.Loader = Loader;
