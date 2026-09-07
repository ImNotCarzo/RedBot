const path = require("path");
const fs = require("fs");
const { isPromise } = require("util/types");
const { PermissionFlagsBits } = require("discord.js");
const { Errors } = require("gralonium");

const DISCORD_ID_PATTERN = /^\d{17,20}$/;

const PREFIXED_TO_SLASH_MAP = {
  channel: "channel/info",
  channelclone: "channel/clone",
  channelunlock: "channel/unlock",
  rename: "channel/rename",
  role: "role/info",
  roleadd: "role/add",
  roleall: "role/all",
  rolebots: "role/bots",
  rolehoist: "role/hoist",
  rolehumans: "role/humans",
  roleicon: "role/icon",
  rolejoin: "role/join",
  rolementionable: "role/mentionable",
  roleremove: "role/remove",
  roleremoveall: "role/removeall",
  rolerename: "role/rename",
  roles: "server/roles",
  roleusers: "role/users",
  roleperms: "role/permissions",
  server: "server/info",
  serverroles: "server/roles",
  serverbanner: "server/banner",
  sroles: "server/roles",
  ubanner: "user/banner",
  user: "user/info",
  userbanner: "user/banner",
  uroles: "user/roles",
  userperms: "user/permissions",
};

const wrappedOriginalCodes = new WeakSet();
const slashCommandMap = new Map();
const inferredPermissionsCache = new Map();

function normalizeReplyPayload(payload) {
  if (typeof payload === "string") return { content: payload };
  if (Array.isArray(payload)) return { content: payload.join("\n") };
  if (!payload || typeof payload !== "object") return { content: String(payload ?? "") };
  return payload;
}

async function resolveMember(ctx, input) {
  if (!ctx?.guild || !input) return null;

  if (ctx.message?.mentions?.members?.size) {
    return ctx.message.mentions.members.first() ?? null;
  }

  const token = String(input).trim();
  if (DISCORD_ID_PATTERN.test(token)) {
    const byId = await ctx.guild.members.fetch(token).catch(() => null);
    if (byId) return byId;
  }

  const byQuery = await ctx.guild.members.fetch({ query: token, limit: 1 }).catch(() => null);
  if (byQuery?.size) return byQuery.first();
  return null;
}

async function resolveMemberFlexible(ctx, input) {
  if (!ctx?.guild) return null;
  if (!input) return ctx.member ?? null;
  if (typeof input === "object" && input?.id) return input;

  const member = await resolveMember(ctx, input);
  if (member) return member;

  const lower = String(input).toLowerCase();
  return ctx.guild.members.cache.find((m) => {
    const username = m.user.username?.toLowerCase() ?? "";
    const globalName = m.user.globalName?.toLowerCase() ?? "";
    const nickname = m.nickname?.toLowerCase() ?? "";
    return username.includes(lower) || globalName.includes(lower) || nickname.includes(lower);
  }) ?? null;
}

async function resolveRoleFlexible(ctx, input) {
  if (!ctx?.guild || !input) return null;

  const mention = input.match(/^<@&(\d{17,20})>$/)?.[1];
  const roleId = mention ?? (DISCORD_ID_PATTERN.test(input) ? input : null);

  if (roleId) {
    const byId = await ctx.guild.roles.fetch(roleId).catch(() => null);
    if (byId) return byId;
  }

  const lower = input.toLowerCase();
  return ctx.guild.roles.cache.find((r) => r.name.toLowerCase().includes(lower)) ?? null;
}

async function resolveChannelFlexible(ctx, input) {
  if (!ctx?.guild || !input) return null;

  const mention = input.match(/^<#(\d{17,20})>$/)?.[1];
  const channelId = mention ?? (DISCORD_ID_PATTERN.test(input) ? input : null);

  if (channelId) {
    const byId = await ctx.guild.channels.fetch(channelId).catch(() => null);
    if (byId) return byId;
  }

  const lower = input.toLowerCase();
  return ctx.guild.channels.cache.find((c) => c.name?.toLowerCase?.().includes(lower)) ?? null;
}

function buildAttachmentFromUrl(input) {
  if (!input || !/^https?:\/\//i.test(input)) return null;

  const name = input.split("/").pop()?.split("?")[0] ?? "archivo";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const imageTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  const audioTypes = { mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "video/webm", m4a: "audio/mp4", flac: "audio/flac" };

  return {
    name,
    url: input,
    contentType: imageTypes[ext] ?? audioTypes[ext] ?? null,
    size: 0,
  };
}

function resolveAttachmentInput(ctx, input) {
  const attached = ctx.message?.attachments?.first?.();
  if (attached) return attached;
  return buildAttachmentFromUrl(input);
}

async function getReferencedMessage(ctx) {
  const message = ctx?.message;
  if (!message?.reference?.messageId) return null;
  try {
    return await message.fetchReference();
  } catch {
    return null;
  }
}

async function parsePrefixedArgsForSlash(ctx, slashCommand, slashName) {
  const defs = slashCommand?.params?.params ?? [];
  const args = [...(ctx.args ?? [])];
  const replyMsg = await getReferencedMessage(ctx);
  const values = {};
  let missingRequired = false;

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const isLast = i === defs.length - 1;
    const token = args[0];
    let value = null;

    if (def.type === 6) {
      if (token) {
        value = await resolveMemberFlexible(ctx, token);
        if (value) args.shift();
      } else if (replyMsg?.author?.id) {
        value = await resolveMemberFlexible(ctx, replyMsg.author.id);
      }
    } else if (def.type === 8) {
      if (token) {
        value = await resolveRoleFlexible(ctx, token);
        if (value) args.shift();
      }
    } else if (def.type === 7) {
      if (token) {
        value = await resolveChannelFlexible(ctx, token);
        if (value) args.shift();
      }
    } else if (def.type === 11) {
      value = resolveAttachmentInput(ctx, token);
      if (!value) {
        value = replyMsg?.attachments?.values()?.next()?.value ?? null;
      }
      if (!ctx.message?.attachments?.size && value) args.shift();
    } else if (def.type === 3) {
      if (args.length) {
        if (slashName === "translate" && def.name === "texto") {
          value = args.splice(0).join(" ");
        } else if (isLast || slashName === "resume") {
          value = args.splice(0).join(" ");
        } else {
          value = args.shift();
        }
      } else if (def.required && replyMsg?.content?.trim()) {
        value = replyMsg.content.trim();
      }
    } else if (args.length) {
      value = args.shift();
    }

    const normalizedValue = value ?? null;
    values[def.name] = normalizedValue;
    if (def.required && normalizedValue === null) missingRequired = true;
  }

  return { values, missingRequired };
}

function loadSlashCommandMap(log) {
  if (slashCommandMap.size) return;

  const slashDir = path.join(__dirname, "../commands/slash");
  const fallbackDir = path.join(__dirname, "../commands");
  const targetDir = fs.existsSync(slashDir) ? slashDir : fallbackDir;
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith("_")) continue;

    let targetFilePath = null;
    let file = null;

    if (entry.isFile() && entry.name.endsWith(".js")) {
      targetFilePath = path.join(targetDir, entry.name);
      file = entry.name.slice(0, -3);
    } else if (entry.isDirectory()) {
      const indexCandidate = path.join(targetDir, entry.name, "index.js");
      if (fs.existsSync(indexCandidate)) {
        targetFilePath = indexCandidate;
        file = entry.name;
      }
    }

    if (!targetFilePath) continue;

    try {
      const mod = require(targetFilePath);
      const exported = mod?.data;
      const rootData = exported?.data;

      if (Array.isArray(rootData?.commands)) {
        const groupName = rootData?.name ?? file;
        for (const cmd of rootData.commands) {
          const name = cmd?.data?.name;
          if (name) slashCommandMap.set(`${groupName}/${name}`, cmd);
        }
        continue;
      }

      if (rootData?.name && typeof exported?.code === "function") {
        slashCommandMap.set(`${rootData.name}/${rootData.name}`, exported);
      }
    } catch (err) {
      log?.warn(`No se pudo cargar comando slash desde ${entry.name}`, { err: err?.message ?? String(err) });
    }
  }
}

function resolveSlashKeyForPrefixedName(command, prefixedName) {
  const explicitGroup = command?.data?.slashGroup;
  if (explicitGroup) return `${explicitGroup}/${prefixedName}`;

  const mapped = PREFIXED_TO_SLASH_MAP[prefixedName];
  if (mapped) return mapped;

  const candidates = [...slashCommandMap.keys()].filter((key) => key.endsWith(`/${prefixedName}`));
  if (candidates.length === 1) return candidates[0];

  return null;
}

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

async function handleMissingPermissionsFirst(ctx, inferred) {
  if (!ctx?.guild || !ctx?.member) return false;
  const { userPerms = [], botPerms = [] } = inferred ?? {};
  const userBits = userPerms.map((name) => PermissionFlagsBits[name]).filter(Boolean);
  const botBits = botPerms.map((name) => PermissionFlagsBits[name]).filter(Boolean);

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

async function runCommandPlugins(ctx, slashCommand) {
  if (!slashCommand) return;
  const plugins = [...(slashCommand.plugins ?? []), ...(ctx?.bot?.loader?.globalPlugins ?? [])];
  for (const plugin of plugins) {
    if (isPromise(plugin)) {
      const resolved = await plugin;
      if (!(await resolved(ctx))) return false;
      continue;
    }
    if (!(await plugin(ctx))) return false;
  }
  return true;
}

function wrapPrefixedCommands(log) {
  loadSlashCommandMap(log);

  const prefixedPath = path.join(__dirname, "../commands", "prefixed");
  const prefixedFiles = fs.readdirSync(prefixedPath).filter((f) => f.endsWith(".js"));

  for (const file of prefixedFiles) {
    const commandModule = require(path.join(prefixedPath, file));
    const command = commandModule?.data;
    const originalCode = command?.code;

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

      const prefixedName = command?.data?.name;
      const slashKey = resolveSlashKeyForPrefixedName(command, prefixedName);
      const slashName = slashKey?.split("/")[1];
      const slashCommand = slashKey ? slashCommandMap.get(slashKey) : null;

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
          const hadUser = Object.prototype.hasOwnProperty.call(ctx, "user");
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
            if (hadUser) ctx.user = originalUser; else delete ctx.user;
            if (hadCommandForCode) ctx.command = originalCommandForCode; else delete ctx.command;
          }
        } catch (err) {
          if (err && typeof err === "object" && !err.ctx) err.ctx = ctx;
          log?.error(`[adapter:${slashName ?? prefixedName ?? "unknown"}]`, {
            err: err?.stack || err?.message || String(err),
          });
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

module.exports = { wrapPrefixedCommands, resolveMemberFlexible };
