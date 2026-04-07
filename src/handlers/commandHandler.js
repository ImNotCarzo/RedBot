const path   = require("path");
const fs     = require("fs");
const { PermissionFlagsBits } = require("discord.js");
const { Errors } = require("gralonium");
const PREFIXED_TO_SLASH_MAP = require("../../config/prefixedToSlashMap");
const { setId }             = require("../state/commandIds.store");
const { normalizeReplyPayload } = require("../utils/normalize");
const { parsePrefixedArgsForSlash } = require("../utils/parsers");

/** WeakSet to guard against double-wrapping a prefixed command code function. */
const wrappedOriginalCodes = new WeakSet();

/** Map of "group/name" → slash command module (populated lazily). */
const slashCommandMap = new Map();
/** Cache of inferred permission requirements by slash command key. */
const inferredPermissionsCache = new Map();

/**
 * Populate `slashCommandMap` with every slash command from the `commands/` directory.
 * No-op if already loaded.
 */
function loadSlashCommandMap() {
  if (slashCommandMap.size) return;

  const slashFiles = ["channel", "fun", "mod", "role", "server", "user", "util"];

  for (const file of slashFiles) {
    const mod      = require(path.join(__dirname, "../../commands", `${file}.js`));
    const group    = mod?.data?.data;
    const commands = group?.commands ?? [];

    for (const cmd of commands) {
      const name = cmd?.data?.name;
      if (name) slashCommandMap.set(`${file}/${name}`, cmd);
    }
  }

  const ask = require(path.join(__dirname, "../../commands", "ask.js"))?.data;
  if (ask?.data?.name) slashCommandMap.set(`ask/${ask.data.name}`, ask);
}

/**
 * Resolve the "group/name" key in `slashCommandMap` for a given prefixed command name.
 *
 * Resolution order:
 * 1. Explicit `data.slashGroup` on the command.
 * 2. Hard-coded mapping from `config/prefixedToSlashMap.js`.
 * 3. Unique match by name suffix in the map.
 *
 * @param {object} command      - Prefixed command module.
 * @param {string} prefixedName - Name of the prefixed command.
 * @returns {string|null}
 */
function resolveSlashKeyForPrefixedName(command, prefixedName) {
  const explicitGroup = command?.data?.slashGroup;
  if (explicitGroup) return `${explicitGroup}/${prefixedName}`;

  const mapped = PREFIXED_TO_SLASH_MAP[prefixedName];
  if (mapped) return mapped;

  const candidates = [...slashCommandMap.keys()].filter((key) => key.endsWith(`/${prefixedName}`));
  if (candidates.length === 1) return candidates[0];

  return null;
}

/**
 * Infer user/bot permission checks from command source to prioritize
 * permission errors before parameter-missing fallback in prefixed mode.
 *
 * @param {string} slashKey
 * @param {object|null} slashCommand
 * @returns {{ userPerms: string[], botPerms: string[] }}
 */
function inferPermissionChecks(slashKey, slashCommand) {
  if (!slashKey || !slashCommand?.code) return { userPerms: [], botPerms: [] };
  if (inferredPermissionsCache.has(slashKey)) return inferredPermissionsCache.get(slashKey);

  const src = String(slashCommand.code);
  const userPerms = new Set();
  const botPerms = new Set();

  let match;
  const userRegex = /ctx\.member\.permissions\.has\(\s*PermissionFlagsBits\.(\w+)\s*\)/g;
  while ((match = userRegex.exec(src)) !== null) userPerms.add(match[1]);

  const botRegex = /(?:ctx\.guild|guild)\.members\.me\.permissions\.has\(\s*PermissionFlagsBits\.(\w+)\s*\)/g;
  while ((match = botRegex.exec(src)) !== null) botPerms.add(match[1]);

  const value = { userPerms: [...userPerms], botPerms: [...botPerms] };
  inferredPermissionsCache.set(slashKey, value);
  return value;
}

/**
 * If permissions are missing, reply immediately and return true.
 *
 * @param {import("gralonium").Context} ctx
 * @param {{ userPerms: string[], botPerms: string[] }} inferred
 * @returns {Promise<boolean>}
 */
async function handleMissingPermissionsFirst(ctx, inferred) {
  if (!ctx?.guild || !ctx?.member) return false;
  const { userPerms = [], botPerms = [] } = inferred ?? {};
  const userBits = userPerms.map((name) => PermissionFlagsBits[name]).filter(Boolean);
  const botBits  = botPerms.map((name) => PermissionFlagsBits[name]).filter(Boolean);

  if (userBits.length && !ctx.member.permissions.has(userBits, true)) {
    await ctx.send(`No tienes permisos para usar este comando, necesitas: \`${userPerms.join(", ")}\``);
    return true;
  }

  if (botBits.length && !ctx.guild.members.me?.permissions?.has(botBits, true)) {
    await ctx.send(`No tengo permisos suficientes, necesito: \`${botPerms.join(", ")}\``);
    return true;
  }

  return false;
}

/**
 * Validate declarative command permissions (from CommandBuilder) before params.
 *
 * @param {import("gralonium").Context} ctx
 * @param {object|null} slashCommand
 */
function assertCommandDataPermissions(ctx, slashCommand) {
  if (!ctx?.guild || !ctx?.member || !slashCommand?.data) return;

  const userPerms = slashCommand.data.userPermissions ?? [];
  const botPerms = slashCommand.data.botPermissions ?? [];

  if (userPerms.length && !ctx.member.permissions.has(userPerms, true)) {
    throw new Errors.MissingPermission(ctx, userPerms);
  }

  if (botPerms.length && !ctx.guild.members.me?.permissions?.has(botPerms, true)) {
    throw new Errors.MissingBotPermission(ctx, botPerms);
  }
}

/**
 * Execute command plugins and global plugins in the same way as Gralonium.
 *
 * @param {import("gralonium").Context} ctx
 * @param {object|null} slashCommand
 */
async function runCommandPlugins(ctx, slashCommand) {
  if (!slashCommand) return;
  const plugins = [...(slashCommand.plugins ?? []), ...(ctx?.bot?.loader?.globalPlugins ?? [])];
  for (const plugin of plugins) {
    const result = await plugin(ctx);
    if (result === false) return false;
  }
  return true;
}

/**
 * Wrap every prefixed command so it:
 * 1. Uses `message.reply()` with `allowedMentions.repliedUser = false`.
 * 2. Delegates to the matching slash command implementation (via arg parsing).
 * 3. Falls back to the original prefixed implementation if args are missing.
 *
 * @param {import("../core/logger")} [log]
 */
function wrapPrefixedCommands(log) {
  loadSlashCommandMap();

  const prefixedPath  = path.join(__dirname, "../../commands", "prefixed");
  const prefixedFiles = fs.readdirSync(prefixedPath).filter((f) => f.endsWith(".js"));

  for (const file of prefixedFiles) {
    const commandModule = require(path.join(prefixedPath, file));
    const command       = commandModule?.data;
    const originalCode  = command?.code;

    if (typeof originalCode !== "function" || wrappedOriginalCodes.has(originalCode)) continue;

    command.code = async function (ctx, ...args) {
      const originalReply = ctx?.message?.reply?.bind(ctx.message);

      if (originalReply) {
        ctx.send = (payload) => {
          const normalized = normalizeReplyPayload(payload);
          return originalReply({
            ...normalized,
            allowedMentions: {
              ...normalized.allowedMentions,
              repliedUser: false,
            },
          });
        };
      }

      const prefixedName  = command?.data?.name;
      const slashKey      = resolveSlashKeyForPrefixedName(command, prefixedName);
      const slashName     = slashKey?.split("/")[1];
      const slashCommand  = slashKey ? slashCommandMap.get(slashKey) : null;

      if (slashCommand?.code) {
        try {
          assertCommandDataPermissions(ctx, slashCommand);

          const hadCommand = Object.prototype.hasOwnProperty.call(ctx, "command");
          const originalCommand = ctx.command;
          ctx.command = slashCommand;
          try {
            const canRunPlugins = await runCommandPlugins(ctx, slashCommand);
            if (!canRunPlugins) return;
          } finally {
            if (hadCommand) ctx.command = originalCommand; else delete ctx.command;
          }

          const parsedValues = await parsePrefixedArgsForSlash(ctx, slashCommand, slashName);
          if (!parsedValues) return;
          if (parsedValues.missingRequired) {
            const inferred = inferPermissionChecks(slashKey, slashCommand);
            const blocked = await handleMissingPermissionsFirst(ctx, inferred);
            if (blocked) return;
          }
          if (parsedValues.missingRequired) {
            const fallbackResult = await originalCode.call(this, ctx, ...args);
            if (fallbackResult !== undefined) return fallbackResult;
            return ctx.send("Faltan parámetros requeridos para ejecutar este comando.");
          }

          const originalGet = ctx.get?.bind(ctx);
          const hadUser     = Object.prototype.hasOwnProperty.call(ctx, "user");
          const originalUser = ctx.user;
          const hadCommandForCode = Object.prototype.hasOwnProperty.call(ctx, "command");
          const originalCommandForCode = ctx.command;

          ctx.get = (name) => parsedValues.values[name] ?? null;
          if (!ctx.user && ctx.author) ctx.user = ctx.author;
          ctx.command = slashCommand;

          try {
            return await slashCommand.code(ctx, ...args);
          } finally {
            if (originalGet) ctx.get = originalGet; else delete ctx.get;
            if (hadUser)     ctx.user = originalUser; else delete ctx.user;
            if (hadCommandForCode) ctx.command = originalCommandForCode; else delete ctx.command;
          }
        } catch (err) {
          log?.error(`[adapter:${slashName}]`, { err: err.message });
          throw err;
        }
      }

      try {
        return await originalCode.call(this, ctx, ...args);
      } catch (err) {
        log?.error(`[${command?.data?.name ?? file}]`, { err: err.message });
        return ctx.send("Ocurrió un error ejecutando el comando");
      }
    };

    wrappedOriginalCodes.add(originalCode);
  }
}

module.exports = { wrapPrefixedCommands, loadSlashCommandMap, slashCommandMap, setId };
