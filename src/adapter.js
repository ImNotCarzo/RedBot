const path = require("path");
const fs = require("fs");
const { isPromise } = require("util/types");
const { Errors } = require("gralonium");

const DISCORD_ID_PATTERN = /^\d{17,20}$/;

const PREFIXED_TO_SLASH_MAP = {
  admin: "admin",
  avatar: "user/avatar",
  banner: "server/banner",
  botinfo: "util/botinfo",
  channelinfo: "channel/info",
  clone: "channel/clone",
  color: "role/color",
  dmall: "util/dm",
  emojis: "server/emojis",
  logo: "server/logo",
  permissions: "role/permissions",
  rename: "channel/rename",
  role: "role/info",
  roleadd: "role/add",
  roleall: "role/all",
  rolebots: "role/bots",
  rolecolor: "role/color",
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
  serverbanner: "server/banner",
  ubanner: "user/banner",
  unlock: "channel/unlock",
  user: "user/info",
  useravatar: "user/avatar",
  uroles: "user/roles",
  userperms: "user/permissions",
};

const wrappedOriginalCodes = new WeakSet();
const slashCommandMap = new Map();

function normalizeReplyPayload(payload) {
  if (typeof payload === "string") return { content: payload };
  if (Array.isArray(payload)) return { content: payload.join("\n") };
  if (!payload || typeof payload !== "object") return { content: String(payload ?? "") };
  return payload;
}

async function resolveMember(ctx, input) {
  if (!ctx?.guild || !input) return null;

  const token = String(input).trim();
  const mentionId = token.match(/^<@!?(\d{17,20})>$/)?.[1];
  const targetId = mentionId ?? (DISCORD_ID_PATTERN.test(token) ? token : null);

  if (targetId) {
    return (
      ctx.message?.mentions?.members?.get(targetId) ??
      ctx.guild.members.cache.get(targetId) ??
      (await ctx.guild.members.fetch(targetId).catch(() => null))
    );
  }

  const byQuery = await ctx.guild.members.fetch({ query: token, limit: 1 }).catch(() => null);
  return byQuery?.first() ?? null;
}

async function resolveMemberFlexible(ctx, input, { strictMentionOrId = false } = {}) {
  if (!input) return ctx.member ?? ctx.user ?? ctx.author ?? null;
  if (typeof input === "object" && input?.id) return input;

  const token = String(input).trim();
  const idMatch = token.match(/^<@!?(\d{17,20})>$/)?.[1] ?? (DISCORD_ID_PATTERN.test(token) ? token : null);

  if (strictMentionOrId && !idMatch) return null;

  if (ctx?.guild) {
    const member = await resolveMember(ctx, token);
    if (member) return member;
  }

  if (!ctx?.guild && idMatch) {
    const client = ctx.bot?.client ?? ctx.client ?? ctx.message?.client;
    const user = await client?.users?.fetch?.(idMatch).catch(() => null);
    if (user) return user;
  }

  if (!ctx?.guild || strictMentionOrId) return null;

  const lower = token.toLowerCase();
  return ctx.guild.members.cache.find((m) => {
    const username = m.user.username?.toLowerCase() ?? "";
    const globalName = m.user.globalName?.toLowerCase() ?? "";
    const nickname = m.nickname?.toLowerCase() ?? "";
    return username.includes(lower) || globalName.includes(lower) || nickname.includes(lower);
  }) ?? null;
}

async function resolveRoleFlexible(ctx, input) {
  if (!ctx?.guild || !input) return null;

  const roleId = input.match(/^<@&(\d{17,20})>$/)?.[1] ?? (DISCORD_ID_PATTERN.test(input) ? input : null);
  if (roleId) {
    const byId = await ctx.guild.roles.fetch(roleId).catch(() => null);
    if (byId) return byId;
  }

  const lower = input.toLowerCase();
  return ctx.guild.roles.cache.find((r) => r.name.toLowerCase().includes(lower)) ?? null;
}

async function resolveChannelFlexible(ctx, input) {
  if (!ctx?.guild || !input) return null;

  const channelId = input.match(/^<#(\d{17,20})>$/)?.[1] ?? (DISCORD_ID_PATTERN.test(input) ? input : null);
  if (channelId) {
    const byId = await ctx.guild.channels.fetch(channelId).catch(() => null);
    if (byId) return byId;
  }

  const lower = input.toLowerCase();
  return ctx.guild.channels.cache.find((c) => c.name?.toLowerCase?.().includes(lower)) ?? null;
}

function buildAttachmentFromUrl(input, paramName = "") {
  if (!input || !/^https?:\/\//i.test(input)) return null;

  const name = input.split("/").pop()?.split("?")[0] ?? "archivo";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mimeTypes = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "video/webm", m4a: "audio/mp4", flac: "audio/flac",
  };

  let contentType = mimeTypes[ext] ?? null;
  if (!contentType) {
    contentType = paramName === "audio" ? "audio/mpeg" : "image/png";
  }

  return {
    name,
    url: input,
    contentType,
    size: 0,
  };
}

function resolveAttachmentInput(ctx, input, paramName = "") {
  return ctx.message?.attachments?.first?.() ?? buildAttachmentFromUrl(input, paramName);
}

async function getReferencedMessage(ctx) {
  if (!ctx?.message?.reference?.messageId) return null;
  return ctx.message.fetchReference().catch(() => null);
}

async function parsePrefixedArgsForSlash(ctx, slashCommand, slashName) {
  const defs = slashCommand?.params?.params ?? [];
  const args = [...(ctx.args ?? [])];
  const replyMsg = await getReferencedMessage(ctx);
  const values = {};
  let missingRequired = false;

  if (slashName === "purge" && args.length >= 2 && !/^\d{1,3}$/.test(args[0]) && /^\d{1,3}$/.test(args[1])) {
    [args[0], args[1]] = [args[1], args[0]];
  }

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const isLast = i === defs.length - 1;
    const token = args[0];
    let value = null;

    if (def.type === 6) {
      const isOptionalMassbanSlot = slashName === "massban" && !def.required;
      if (token) {
        value = await resolveMemberFlexible(ctx, token, { strictMentionOrId: isOptionalMassbanSlot });
        if (value) args.shift();
      } else if (def.required && replyMsg?.author?.id) {
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
      } else if (def.required && slashName === "rename" && ctx.channel) {
        value = ctx.channel;
      }
    } else if (def.type === 11) {
      value = resolveAttachmentInput(ctx, token, def.name) ?? replyMsg?.attachments?.first?.() ?? null;
      if (!ctx.message?.attachments?.size && value) args.shift();
    } else if (def.type === 5) {
      if (args.length) {
        const raw = String(args.shift()).toLowerCase();
        value = ["true", "si", "sí", "yes", "1", "s", "bots"].includes(raw) ? "true" : "false";
      }
    } else if (def.type === 3) {
      if (args.length) {
        if (def.name === "incluir_bots" || def.name === "ignorar_bots") {
          const raw = String(args.shift()).toLowerCase();
          value = ["true", "si", "sí", "yes", "1", "s", "bots"].includes(raw) ? "true" : "false";
        } else if (slashName === "translate" && def.name === "texto") {
          if (args.length > 1 && /^[a-z]{2,5}(-[a-z]{2,4})?$/i.test(args[args.length - 1])) {
            const langArg = args.pop();
            value = args.splice(0).join(" ");
            args.push(langArg);
          } else {
            value = args.splice(0).join(" ");
          }
        } else if (def.name === "razon" && defs.some((d) => d.name === "dias") && args.length > 1) {
          const lastArg = args[args.length - 1];
          if (/^[0-7]$/.test(lastArg)) {
            const daysArg = args.pop();
            value = args.splice(0).join(" ");
            args.push(daysArg);
          } else {
            value = args.splice(0).join(" ");
          }
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

    values[def.name] = value ?? null;
    if (def.required && values[def.name] === null) missingRequired = true;
  }

  return { values, missingRequired };
}

function loadSlashCommandMap(log) {
  if (slashCommandMap.size) return;

  const slashDir = path.join(__dirname, "../commands/slash");
  const targetDir = fs.existsSync(slashDir) ? slashDir : path.join(__dirname, "../commands");
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js") || entry.name.startsWith("_")) continue;
    const file = entry.name.slice(0, -3);

    try {
      const exported = require(path.join(targetDir, entry.name))?.data;
      const rootData = exported?.data;

      if (Array.isArray(rootData?.commands)) {
        const groupName = rootData?.name ?? file;
        for (const cmd of rootData.commands) {
          if (cmd?.data?.name) slashCommandMap.set(`${groupName}/${cmd.data.name}`, cmd);
        }
      } else if (rootData?.name && typeof exported?.code === "function") {
        slashCommandMap.set(`${rootData.name}/${rootData.name}`, exported);
      }
    } catch (err) {
      log?.warn(`No se pudo cargar comando slash desde ${entry.name}`, { err: err?.message ?? String(err) });
    }
  }
}

function resolveSlashKeyForPrefixedName(command, prefixedName) {
  if (command?.data?.slashGroup) return `${command.data.slashGroup}/${prefixedName}`;
  if (PREFIXED_TO_SLASH_MAP[prefixedName]) return PREFIXED_TO_SLASH_MAP[prefixedName];

  const candidates = [...slashCommandMap.keys()].filter((key) => key.endsWith(`/${prefixedName}`));
  return candidates.length === 1 ? candidates[0] : null;
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
  if (!slashCommand) return true;
  const plugins = [...(slashCommand.plugins ?? []), ...(ctx?.bot?.loader?.globalPlugins ?? [])];
  for (const plugin of plugins) {
    const fn = isPromise(plugin) ? await plugin : plugin;
    if (!(await fn(ctx))) return false;
  }
  return true;
}

function wrapSingleCommand(command, file, log) {
  const originalCode = command?.code;
  if (typeof originalCode !== "function" || wrappedOriginalCodes.has(originalCode)) return;

  command.code = async function (ctx, ...args) {
    const originalReply = ctx?.message?.reply?.bind(ctx.message);
    if (originalReply) {
      ctx.send = (payload) => {
        const normalized = normalizeReplyPayload(payload);
        return originalReply({
          ...normalized,
          allowedMentions: { ...normalized.allowedMentions, repliedUser: false },
        });
      };
      if (!ctx.reply) ctx.reply = ctx.send;
    }

    const prefixedName = command?.data?.name;
    const slashKey = resolveSlashKeyForPrefixedName(command, prefixedName);
    const slashName = slashKey?.split("/")[1];
    const slashCommand = slashKey ? slashCommandMap.get(slashKey) : null;

    if (slashCommand?.code) {
      try {
        assertCommandDataPermissions(ctx, slashCommand);

        const prevCommand = ctx.command;
        ctx.command = slashCommand;
        try {
          if (!(await runCommandPlugins(ctx, slashCommand))) return;
        } finally {
          ctx.command = prevCommand;
        }

        const parsedValues = await parsePrefixedArgsForSlash(ctx, slashCommand, slashName);
        if (!parsedValues) return;

        if (parsedValues.missingRequired) {
          const fallbackResult = await originalCode.call(this, ctx, ...args);
          if (fallbackResult !== undefined) return fallbackResult;
          return ctx.send("Faltan parámetros requeridos para ejecutar este comando.");
        }

        const prevGet = ctx.get;
        const prevUser = ctx.user;
        ctx.get = (name) => parsedValues.values[name] ?? null;
        if (!ctx.user && ctx.author) ctx.user = ctx.author;
        ctx.command = slashCommand;

        try {
          return await slashCommand.code(ctx, ...args);
        } finally {
          ctx.get = prevGet;
          ctx.user = prevUser;
          ctx.command = prevCommand;
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

function wrapPrefixedCommands(log) {
  loadSlashCommandMap(log);

  const prefixedPath = path.join(__dirname, "../commands", "prefixed");
  const prefixedFiles = fs.readdirSync(prefixedPath).filter((f) => f.endsWith(".js"));

  for (const file of prefixedFiles) {
    const exported = require(path.join(prefixedPath, file))?.data;
    const list = Array.isArray(exported) ? exported : [exported];
    for (const cmd of list) {
      if (cmd) wrapSingleCommand(cmd, file, log);
    }
  }
}

module.exports = { wrapPrefixedCommands, resolveMemberFlexible };
