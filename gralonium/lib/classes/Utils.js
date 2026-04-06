"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = void 0;

const tslib_1 = require("tslib");
const types_1 = require("util/types");
const DJS = tslib_1.__importStar(require("discord.js"));
const Errors = tslib_1.__importStar(require("./Errors.js"));
const Cooldowns_js_1 = require("./Cooldowns.js");

class Utils {
  static isType(obj, func) {
    return func(obj);
  }

  static noop(n = null) {
    return n;
  }

  static #toLower(value) {
    return String(value || "").toLowerCase().trim();
  }

  static #isBlank(value) {
    return value === undefined || value === null || value === "";
  }

  static #consumeHeadTokens(text, count) {
    let output = String(text || "").trim();
    for (let index = 0; index < count; index += 1) {
      output = output.replace(/^\S+\s*/u, "");
      if (!output.length) return "";
    }
    return output.trimStart();
  }

  static async getMember(query, options) {
    if (!query || !options?.guild) return null;

    const cleanQuery = Utils.#toLower(query);
    const id = query.replace(/[^\d]/g, "");
    let member = id ? options.guild.members.cache.get(id) : null;

    member =
      member ||
      options.guild.members.cache.find((target) => {
        const username = Utils.#toLower(target.user.username);
        const displayName = Utils.#toLower(target.displayName);
        const globalName = Utils.#toLower(target.user.globalName);
        return username === cleanQuery || displayName === cleanQuery || globalName === cleanQuery || username.includes(cleanQuery);
      }) ||
      null;

    if (!member && id && options.force) {
      member = (await options.guild.members.fetch(id).catch(Utils.noop)) || null;
    }

    return member;
  }

  static async getChannel(query, options) {
    if (!query || !options?.guild) return null;

    const cleanQuery = Utils.#toLower(query);
    const id = query.replace(/[^\d]/g, "");
    let channel = id ? options.guild.channels.cache.get(id) : null;

    channel =
      channel ||
      options.guild.channels.cache.find((target) => {
        const name = Utils.#toLower(target.name);
        return name === cleanQuery || name.includes(cleanQuery);
      }) ||
      null;

    if (!channel && id && options.force) {
      channel = (await options.guild.channels.fetch(id).catch(Utils.noop)) || null;
    }

    return channel;
  }

  static async getRole(query, options) {
    if (!query || !options?.guild) return null;

    const cleanQuery = Utils.#toLower(query);
    const id = query.replace(/[^\d]/g, "");
    let role = id ? options.guild.roles.cache.get(id) : null;

    role =
      role ||
      options.guild.roles.cache.find((target) => {
        const name = Utils.#toLower(target.name);
        return name === cleanQuery || name.includes(cleanQuery);
      }) ||
      null;

    if (!role && id && options.force) {
      role = (await options.guild.roles.fetch(id).catch(Utils.noop)) || null;
    }

    return role;
  }

  static async getUser(query, bot) {
    if (!query) return null;

    const cleanQuery = Utils.#toLower(query);
    const id = query.replace(/[^\d]/g, "");

    const cached =
      (id ? bot.users.cache.get(id) : null) ||
      bot.users.cache.find((user) => {
        const username = Utils.#toLower(user.username);
        const globalName = Utils.#toLower(user.globalName);
        return globalName === cleanQuery || username === cleanQuery || user.id === query;
      }) ||
      null;

    if (cached) return cached;

    try {
      return await bot.users.fetch(id || query);
    } catch {
      return null;
    }
  }

  static #assertCommandShape(command) {
    if (!command?.data?.name || typeof command.code !== "function") {
      throw new Error("Invalid command module shape: expected { data: CommandBuilder, code(ctx) }.");
    }
  }

  static #cloneParams(paramsBuilder) {
    if (!paramsBuilder?.params?.length) return [];
    return paramsBuilder.params.map((param) => ({ ...param, value: undefined }));
  }

  static #normalizeChoiceInput(input) {
    return String(input ?? "").toLowerCase().trim();
  }

  static async transform(input, param, ctx, seeable = true) {
    if (!input && seeable) {
      return { break: false, value: null };
    }

    if (param.choices?.length) {
      const normalizedInput = Utils.#normalizeChoiceInput(input);
      const selected = param.choices.find(
        (choice) => Utils.#normalizeChoiceInput(choice.name) === normalizedInput || String(choice.value) === String(input)
      );
      if (selected) return { break: false, value: selected.value };
      throw new Errors.InvalidParamChoice(ctx, param, param.choices);
    }

    if (param.type === DJS.ApplicationCommandOptionType.String) {
      const value = String(input ?? "");

      if (typeof param.max_length === "number" && value.length > param.max_length) {
        throw new Errors.InvalidParam(ctx, `${param.name} exceeds max length.`, { param });
      }

      if (typeof param.min_length === "number" && value.length < param.min_length) {
        throw new Errors.InvalidParam(ctx, `${param.name} is under min length.`, { param });
      }

      return { break: false, value };
    }

    if (param.type === DJS.ApplicationCommandOptionType.Number) {
      const value = Number(input);
      if (Number.isNaN(value)) throw new Errors.InvalidParamNumber(ctx, param);

      if (typeof param.max_value === "number" && value > param.max_value) {
        throw new Errors.InvalidParam(ctx, `${param.name} exceeds max value.`, { param });
      }

      if (typeof param.min_value === "number" && value < param.min_value) {
        throw new Errors.InvalidParam(ctx, `${param.name} is under min value.`, { param });
      }

      return { break: false, value };
    }

    if (param.type === DJS.ApplicationCommandOptionType.Boolean) {
      const lowered = String(input).toLowerCase().trim();
      if (lowered !== "true" && lowered !== "false") throw new Errors.InvalidParamBoolean(ctx, param);
      return { break: false, value: lowered === "true" };
    }

    if (param.type === DJS.ApplicationCommandOptionType.User) {
      const member = ctx.guild ? await Utils.getMember(String(input), { guild: ctx.guild, force: true }) : await Utils.getUser(String(input), ctx.bot);
      if (member) return { break: false, value: member };
      throw new Errors.InvalidParamMember(ctx, param);
    }

    if (param.type === DJS.ApplicationCommandOptionType.Channel) {
      const channel = await Utils.getChannel(String(input), { guild: ctx.guild, force: true });
      if (!channel) throw new Errors.InvalidParamChannel(ctx, param);

      if (param.channel_types?.length && !param.channel_types.includes(channel.type)) {
        throw new Errors.InvalidChannelType(ctx, param, channel.type, param.channel_types);
      }

      return { break: false, value: channel };
    }

    if (param.type === DJS.ApplicationCommandOptionType.Role) {
      const role = await Utils.getRole(String(input), { guild: ctx.guild, force: true });
      if (role) return { break: false, value: role };
      throw new Errors.InvalidParamRole(ctx, param);
    }

    if (param.type === DJS.ApplicationCommandOptionType.Attachment) {
      const attachment = ctx.message?.attachments?.first();
      if (!attachment && param.required) throw new Errors.InvalidParamAttachment(ctx, param);
      return { break: false, value: attachment };
    }

    return { break: false, value: input ?? null };
  }

  static async #resolvePrefixParams(ctx, command, args) {
    const params = Utils.#cloneParams(command.params);
    if (!params.length) {
      ctx.params = [];
      ctx.args = args;
      return;
    }

    let argIndex = 0;

    for (let paramIndex = 0; paramIndex < params.length; paramIndex += 1) {
      const param = params[paramIndex];

      if (param.type === DJS.ApplicationCommandOptionType.Attachment) {
        const transformed = await Utils.transform("", param, ctx, false);
        param.value = transformed.value;
        continue;
      }

      if (param.ellipsis) {
        const remaining = args.slice(argIndex).join(" ").trim();

        if (!remaining && param.required) {
          throw new Errors.MissingRequiredParam(ctx, param);
        }

        if (remaining) {
          const transformed = await Utils.transform(remaining, param, ctx);
          param.value = transformed.value;
          argIndex = args.length;
        } else {
          param.value = null;
        }

        continue;
      }

      const raw = args[argIndex];
      if (Utils.#isBlank(raw) && param.required) {
        throw new Errors.MissingRequiredParam(ctx, param);
      }

      if (Utils.#isBlank(raw)) {
        param.value = null;
      } else {
        const transformed = await Utils.transform(raw, param, ctx);
        param.value = transformed.value;
      }

      argIndex += 1;
    }

    ctx.params = params;
    ctx.args = args;
  }

  static #resolveInteractionParamValue(interaction, param) {
    const name = param.name;
    const required = !!param.required;

    switch (param.type) {
      case DJS.ApplicationCommandOptionType.String:
        return interaction.options.getString(name, required);
      case DJS.ApplicationCommandOptionType.Number:
        return interaction.options.getNumber(name, required);
      case DJS.ApplicationCommandOptionType.Boolean:
        return interaction.options.getBoolean(name, required);
      case DJS.ApplicationCommandOptionType.User:
        return interaction.options.getMember(name) ?? interaction.options.getUser(name, required);
      case DJS.ApplicationCommandOptionType.Channel:
        return interaction.options.getChannel(name, required);
      case DJS.ApplicationCommandOptionType.Role:
        return interaction.options.getRole(name, required);
      case DJS.ApplicationCommandOptionType.Attachment:
        return interaction.options.getAttachment(name, required);
      default:
        return interaction.options.get(name)?.value ?? null;
    }
  }

  static async #resolveInteractionParams(ctx, command, interaction) {
    const params = Utils.#cloneParams(command.params);

    for (const param of params) {
      const value = Utils.#resolveInteractionParamValue(interaction, param);

      if ((value === null || value === undefined) && param.required) {
        throw new Errors.MissingRequiredParam(ctx, param);
      }

      param.value = value ?? null;
    }

    ctx.params = params;
    ctx.args = null;
  }

  static async #runPlugins(ctx, command) {
    const plugins = [...(command.plugins ?? []), ...ctx.bot.loader.globalPlugins];
    for (const plugin of plugins) {
      if ((0, types_1.isPromise)(plugin)) {
        const resolved = await plugin;
        if (!(await resolved(ctx))) return false;
        continue;
      }

      if (!(await plugin(ctx))) return false;
    }

    return true;
  }

  static async #runPredicates(ctx, predicates) {
    for (const predicate of predicates) {
      if (!predicate) continue;
      if (!(await predicate(ctx))) return false;
    }
    return true;
  }

  static #getMemberPermissions(ctx) {
    if (!ctx.member) return null;

    if (ctx.member.permissions?.has) {
      return ctx.member.permissions;
    }

    if (ctx.member.permissions !== undefined) {
      try {
        return new DJS.PermissionsBitField(ctx.member.permissions);
      } catch {
        return null;
      }
    }

    return null;
  }

  static #assertRequiredPermissions(ctx, requiredUserPerms = [], requiredBotPerms = []) {
    if (!ctx.guild) return;

    if (requiredUserPerms.length) {
      const memberPermissions = Utils.#getMemberPermissions(ctx);
      if (!memberPermissions?.has(requiredUserPerms)) {
        throw new Errors.MissingPermission(ctx, requiredUserPerms);
      }
    }

    if (requiredBotPerms.length) {
      const botPermissions = ctx.guild.members.me?.permissions;
      if (!botPermissions?.has(requiredBotPerms)) {
        throw new Errors.MissingBotPermission(ctx, requiredBotPerms);
      }
    }
  }

  static #resolveCooldownSource(ctx, bucket) {
    switch (bucket) {
      case Cooldowns_js_1.Bucket.Guild:
        return ctx.guild?.id || "-1";
      case Cooldowns_js_1.Bucket.Member:
        return ctx.guild ? `${ctx.guild.id}_${ctx.author.id}` : ctx.author.id;
      case Cooldowns_js_1.Bucket.Channel:
        return ctx.channel?.id || "-1";
      case Cooldowns_js_1.Bucket.User:
      default:
        return ctx.author.id;
    }
  }

  static async #applyCooldown(ctx, command) {
    const cooldown = command?.data?.cooldown;
    if (!cooldown?.seconds || cooldown.seconds <= 0) return;

    const bucket = cooldown.bucket || Cooldowns_js_1.Bucket.User;
    const source = Utils.#resolveCooldownSource(ctx, bucket);
    const cooldownMs = cooldown.seconds * 1000;

    const active = await ctx.bot.cooldowns.check(command.data.name, source, cooldownMs, bucket);
    if (active) throw new Errors.CommandInCooldown(ctx, active.left);

    await ctx.bot.cooldowns.setCooldownSource(command.data.name, source, bucket, cooldownMs);
  }

  static #validateContextRestrictions(ctx) {
    if (ctx.guild && ctx.bot.ops.restrictions?.guildIDs?.has(String(ctx.guild.id))) {
      throw new Errors.RestrictedGuild(ctx, ctx.guild);
    }

    if (ctx.bot.ops.restrictions?.userIDs?.has(ctx.author.id)) {
      throw new Errors.RestrictedUser(ctx, ctx.author);
    }
  }

  static #prepareExecutionContext(ctx, command, group, source, prefix = "") {
    ctx.command = command;
    ctx.parent = group;
    ctx.prefix = prefix;
    ctx.args = source === "prefix" ? [] : null;
    ctx.params = [];
  }

  static #assertGuildRestrictions(ctx, command, group) {
    if (ctx.bot.ops.guildOnly && !ctx.guild) {
      throw new Errors.GuildOnly(ctx);
    }

    if (command.data.guildOnly === true && !ctx.guild) {
      throw new Errors.GuildOnly(ctx, "This command is only available in guilds.");
    }

    if (group?.data?.guildOnly === true && !ctx.guild) {
      throw new Errors.GuildOnly(ctx, "This command group is only available in guilds.");
    }
  }

  static async #resolveCommandInput(ctx, command, options) {
    if (options.source === "prefix") {
      await Utils.#resolvePrefixParams(ctx, command, options.args ?? []);
      return;
    }

    if (!options.interaction) {
      throw new Error("Missing interaction for slash execution.");
    }

    await Utils.#resolveInteractionParams(ctx, command, options.interaction);
  }

  static async #runPreExecution(ctx, command, group) {
    Utils.#assertRequiredPermissions(
      ctx,
      [...(group?.data?.userPermissions ?? []), ...(command.data?.userPermissions ?? [])],
      [...(group?.data?.botPermissions ?? []), ...(command.data?.botPermissions ?? [])]
    );

    const canRunPlugins = await Utils.#runPlugins(ctx, command);
    if (!canRunPlugins) return false;

    const canRunGuards = await Utils.#runPredicates(ctx, [...(group?.data?.guards ?? []), ...(command.data?.guards ?? [])]);
    if (!canRunGuards) return false;

    await Utils.#applyCooldown(ctx, command);
    return true;
  }

  static async executeCommand(ctx, command, options) {
    Utils.#assertCommandShape(command);

    const { group = null, source, prefix = "" } = options;
    Utils.#prepareExecutionContext(ctx, command, group, source, prefix);
    Utils.#assertGuildRestrictions(ctx, command, group);

    const canProceed = await Utils.#runPreExecution(ctx, command, group);
    if (!canProceed) return;

    await Utils.#resolveCommandInput(ctx, command, options);
    await command.code(ctx);
  }

  static async #resolvePrefix(bot, ctx, message) {
    if (typeof bot.ops.prefix === "string") {
      if (!message.content.toLowerCase().startsWith(bot.ops.prefix.toLowerCase())) return null;
      return bot.ops.prefix;
    }

    if (Array.isArray(bot.ops.prefix)) {
      return bot.ops.prefix.find((prefix) => message.content.toLowerCase().startsWith(prefix.toLowerCase())) || null;
    }

    if ((0, types_1.isAsyncFunction)(bot.ops.prefix) || typeof bot.ops.prefix === "function") {
      const resolved = await bot.ops.prefix(ctx);
      if (!resolved) return null;

      if (Array.isArray(resolved)) {
        return resolved.find((prefix) => message.content.toLowerCase().startsWith(String(prefix).toLowerCase())) || null;
      }

      if (!message.content.toLowerCase().startsWith(String(resolved).toLowerCase())) return null;
      return String(resolved);
    }

    return null;
  }

  static #matchAlias(target, value) {
    const lowered = value.toLowerCase();
    return target.data.name.toLowerCase() === lowered || (target.data.aliases || []).map((alias) => alias.toLowerCase()).includes(lowered);
  }

  static #resolvePrefixRoute(bot, body) {
    const routingTokens = body.trim().split(/\s+/g).filter(Boolean);
    const trigger = (routingTokens.shift() || "").toLowerCase();
    if (!trigger) return null;

    const normal =
      bot.loader.commands.normal?.find((command) => Utils.#matchAlias(command, trigger) && command.data.as_prefix) || null;

    const group = bot.loader.commands.group?.find((entry) => Utils.#matchAlias(entry, trigger) && entry.data.as_prefix) || null;

    if (group) {
      const maybeSub = (routingTokens.shift() || "").toLowerCase();
      const sub =
        group.data.commands.find((command) => Utils.#matchAlias(command, maybeSub) && command.data.as_prefix) ||
        group.data.commands.find((command) => command.data.fallback && command.data.as_prefix) ||
        null;

      if (sub) {
        const consumedTokens = maybeSub ? 2 : 1;
        return { command: sub, group, consumedTokens };
      }
    }

    if (!normal) return null;
    return { command: normal, group: null, consumedTokens: 1 };
  }

  static async handleMessage(bot, message, isEdit = false) {
    if (!message || message.author?.bot) return;

    if (message.partial) {
      try {
        await message.fetch();
      } catch {
        return;
      }
    }

    if (!message.content) return;

    const ctx = bot.getContext(message);
    ctx.isEditedMessage = Boolean(isEdit);
    Utils.#validateContextRestrictions(ctx);

    const prefix = await Utils.#resolvePrefix(bot, ctx, message);
    if (!prefix) return;

    const body = message.content.slice(prefix.length).trim();
    if (!body.length) return;

    const resolved = Utils.#resolvePrefixRoute(bot, body);
    if (!resolved) return;

    const argsBody = Utils.#consumeHeadTokens(body, resolved.consumedTokens);
    const useQuoted = resolved.command.params?.quoted !== false;
    const args = argsBody.length ? Utils.splitArgs(argsBody, useQuoted, false) : [];

    await Utils.executeCommand(ctx, resolved.command, {
      group: resolved.group,
      source: "prefix",
      args,
      prefix,
    });
  }

  static #findSlashCommand(bot, interaction) {
    const subCommand = interaction.options.getSubcommand(false);

    if (subCommand) {
      const group = bot.loader.commands.group?.get(interaction.commandName) || null;
      if (!group?.data?.as_slash) return null;

      const command =
        group.data.commands.find((entry) => entry.data.name === subCommand && entry.data.as_slash) ||
        group.data.commands.find((entry) => entry.data.fallback && entry.data.as_slash) ||
        null;

      if (!command) return null;
      return { command, group };
    }

    const command = bot.loader.commands.normal?.find((entry) => entry.data.name === interaction.commandName && entry.data.as_slash) || null;
    if (!command) return null;

    return { command, group: null };
  }

  static #resolveInteractionModule(bot, interaction) {
    if (interaction.isAutocomplete()) return bot.loader.interactions.autocomplete.get(interaction.commandName) || null;
    if (interaction.isButton()) return bot.loader.interactions.button.get(interaction.customId) || null;
    if (interaction.isModalSubmit()) return bot.loader.interactions.modalSubmit.get(interaction.customId) || null;
    if (interaction.isMessageContextMenuCommand()) return bot.loader.interactions.messageContextMenu.get(interaction.commandName) || null;
    if (interaction.isUserContextMenuCommand()) return bot.loader.interactions.userContextMenu.get(interaction.commandName) || null;
    if (interaction.isChannelSelectMenu()) return bot.loader.interactions.channelSelectMenu.get(interaction.customId) || null;
    if (interaction.isMentionableSelectMenu()) return bot.loader.interactions.mentionableSelectMenu.get(interaction.customId) || null;
    if (interaction.isRoleSelectMenu()) return bot.loader.interactions.roleSelectMenu.get(interaction.customId) || null;
    if (interaction.isStringSelectMenu()) return bot.loader.interactions.stringSelectMenu.get(interaction.customId) || null;
    if (interaction.isUserSelectMenu()) return bot.loader.interactions.userSelectMenu.get(interaction.customId) || null;
    return null;
  }

  static async #executeInteractionModule(bot, interaction, moduleData) {
    if (!moduleData?.code) return;

    if (moduleData.code.length >= 2) {
      await moduleData.code(bot, interaction);
      return;
    }

    await moduleData.code(interaction);
  }

  static async #runAnyInteractionHooks(bot, interaction) {
    for (const callback of bot.loader.interactions.anyInteraction.values()) {
      if (!callback?.code) continue;

      if (callback.code.length >= 2) {
        await callback.code(bot, interaction);
        continue;
      }

      await callback.code(interaction);
    }
  }

  static async handleInteraction(bot, interaction) {
    if (!interaction) return;

    const ctx = bot.getContext(interaction);
    Utils.#validateContextRestrictions(ctx);

    if (interaction.isChatInputCommand()) {
      const resolved = Utils.#findSlashCommand(bot, interaction);
      if (!resolved) return;

      await Utils.executeCommand(ctx, resolved.command, {
        group: resolved.group,
        source: "slash",
        interaction,
        prefix: "/",
      });
      return;
    }

    const matched = Utils.#resolveInteractionModule(bot, interaction);
    if (matched) {
      await Utils.#executeInteractionModule(bot, interaction, matched);
    }

    await Utils.#runAnyInteractionHooks(bot, interaction);
  }

  static async runPrefixCommand(ctx, command, args, group) {
    await Utils.executeCommand(ctx, command, {
      group: group || null,
      source: "prefix",
      args,
      prefix: ctx.prefix,
    });
  }

  static async runInteractionCommand(ctx, interaction) {
    const resolved = Utils.#findSlashCommand(ctx.bot, interaction);
    if (!resolved) return;

    await Utils.executeCommand(ctx, resolved.command, {
      group: resolved.group,
      source: "slash",
      interaction,
      prefix: "/",
    });
  }

  static splitArgs(text, special = true, removeNewLines = false) {
    if (!special) {
      return text.trim().split(/ +/g).filter(Boolean);
    }

    const regexp = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[\S]+)/gim;
    const clean = text.replaceAll(/\r|\n/gm, removeNewLines ? "" : "#ER_BREAK_LINE#");
    const args = [];

    let match;
    while ((match = regexp.exec(clean))) {
      args.push(match[0].replace(/^(['"])(.*)\1$/, "$2").replace(/\\(.)/gim, "$1"));
    }

    return args.map((arg) => arg.replaceAll("#ER_BREAK_LINE#", "\n"));
  }
}
exports.Utils = Utils;
