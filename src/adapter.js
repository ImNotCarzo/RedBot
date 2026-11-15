const path = require("path");
const fs = require("fs");
const { isPromise } = require("util/types");

const DISCORD_ID_PATTERN = /^\d{17,20}$/;
const RELEASE_NOTICE_VERSION = "0.4.0";
const seenReleaseUsers = new Set();
const handledReleaseCtx = new WeakSet();

function buildReleaseNoticeEmbed(lang = null) {
  const { EmbedBuilder } = require("discord.js");
  const { RED } = require("./config");
  const resolvedLang = lang ?? require("./i18n").getCurrentLang();
  const isEn = resolvedLang === "en";
  return new EmbedBuilder()
    .setColor(RED)
    .setTitle(isEn ? `New commands added (${RELEASE_NOTICE_VERSION})` : `Nuevos comandos añadidos (${RELEASE_NOTICE_VERSION})`)
    .setDescription([
      isEn
        ? "/server custombot ``.custombot`` -> customize redbot's avatar, banner, nickname, and bio in your server"
        : "/server custombot ``.custombot`` -> personaliza el avatar, banner, apodo y biografia de redbot en tu servidor",
      "",
      "/server customreset ``.customreset``",
      "/util poll ``.poll``",
      "/util remind ``.remind``",
      "/util ocr ``.ocr``",
      "/channel recap ``.recap``",
    ].join("\n"));
}

async function maybeSendReleaseNotice(ctx) {
  if (!ctx || handledReleaseCtx.has(ctx)) return;
  handledReleaseCtx.add(ctx);

  const userId = ctx.user?.id ?? ctx.author?.id ?? ctx.message?.author?.id ?? ctx.interaction?.user?.id;
  if (!userId || ctx.user?.bot || ctx.author?.bot || ctx.message?.author?.bot) return;
  if (seenReleaseUsers.has(userId)) return;

  try {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) return;

    const { ReleaseNotice } = require("./database");
    const exists = await ReleaseNotice.exists({ userId, version: RELEASE_NOTICE_VERSION });
    if (exists) {
      seenReleaseUsers.add(userId);
      return;
    }

    seenReleaseUsers.add(userId);
    await ReleaseNotice.updateOne(
      { userId, version: RELEASE_NOTICE_VERSION },
      { $setOnInsert: { userId, version: RELEASE_NOTICE_VERSION } },
      { upsert: true }
    );

    const payload = { embeds: [buildReleaseNoticeEmbed()] };
    if (ctx.interaction && (ctx.interaction.replied || ctx.interaction.deferred)) {
      await ctx.interaction.followUp(payload).catch(() => {});
    } else {
      await ctx.channel?.send?.(payload).catch(() => {});
    }
  } catch {
    // Nunca interrumpir la ejecución del comando por el aviso de novedades
  }
}

const PREFIXED_TO_SLASH_MAP = {
  afk: "util/afk",
  ask: "ai/ask",
  askreset: "ai/askreset",
  avatar: "user/avatar",
  botinfo: "util/botinfo",
  channelinfo: "channel/info",
  choose: "util/choose",
  clone: "channel/clone",
  color: "role/color",
  critica: "ai/critica",
  custombot: "server/custombot",
  customreset: "server/customreset",
  describe: "ai/describe",
  dmall: "util/dm",
  download: "util/download",
  emojis: "server/emojis",
  excusa: "ai/excusa",
  jumbo: "util/jumbo",
  logo: "server/logo",
  lol: "util/lol",
  ocr: "ai/ocr",
  opinion: "ai/opinion",
  poll: "util/poll",
  randomuser: "user/random",
  recap: "channel/recap",
  remind: "util/remind",
  reminders: "util/reminders",
  rename: "channel/rename",
  resume: "ai/resume",
  roast: "ai/roast",
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
  serverbanner: "server/banner",
  setlang: "util/setlang",
  setup: "server/setup",
  snipe: "channel/snipe",
  teoria: "ai/teoria",
  transcribe: "ai/transcribe",
  ubanner: "user/banner",
  unlock: "channel/unlock",
  user: "user/info",
  uroles: "user/roles",
  userperms: "user/permissions",
};

const wrappedOriginalCodes = new WeakSet();
const slashCommandMap = new Map();

async function resolveMember(ctx, input) {
  if (!ctx?.guild || !input) return null;

  const token = String(input).trim();
  const targetId = token.match(/^<@!?(\d{17,20})>$/)?.[1] ?? (DISCORD_ID_PATTERN.test(token) ? token : null);

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
  if (!input) return ctx.member ?? ctx.user ?? null;
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

async function resolveGuildEntity(manager, mentionPattern, input) {
  if (!manager || !input) return null;

  const entityId = input.match(mentionPattern)?.[1] ?? (DISCORD_ID_PATTERN.test(input) ? input : null);
  if (entityId) {
    const byId = await manager.fetch(entityId).catch(() => null);
    if (byId) return byId;
  }

  const lower = input.toLowerCase();
  return manager.cache.find((entity) => entity.name?.toLowerCase?.().includes(lower)) ?? null;
}

async function resolveRoleFlexible(ctx, input) {
  return resolveGuildEntity(ctx?.guild?.roles, /^<@&(\d{17,20})>$/, input);
}

async function resolveChannelFlexible(ctx, input) {
  return resolveGuildEntity(ctx?.guild?.channels, /^<#(\d{17,20})>$/, input);
}

function buildAttachmentFromUrl(input, paramName = "") {
  if (!input || !/^https?:\/\//i.test(input)) return null;

  const name = input.split("/").pop()?.split("?")[0] ?? "archivo";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mimeTypes = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "video/webm", m4a: "audio/mp4", flac: "audio/flac", mov: "video/quicktime",
  };

  return {
    name,
    url: input,
    contentType: mimeTypes[ext] ?? (paramName === "audio" || paramName === "archivo" ? "audio/mpeg" : "image/png"),
    size: 0,
  };
}

const TRUTHY_TOKENS = ["true", "si", "sí", "yes", "1", "s", "bots"];

// Comandos cuyo unico parametro de usuario es opcional: si el texto no resuelve a nadie, se avisa en vez de usar al autor
const USER_LOOKUP_COMMANDS = new Set([
  "user/info",
  "user/avatar",
  "user/banner",
  "user/roles",
  "user/permissions",
  "ai/roast",
]);

const TRANSLATE_REPLY_LANGS = new Set([
  "es", "en", "pt", "fr", "de", "it", "ja", "ko", "zh", "zh-cn", "zh-tw", "ru", "ar", "nl",
]);

function getMessageText(message) {
  const direct = message?.content?.trim();
  if (direct) return direct;
  const snapshots = message?.messageSnapshots?.values ? [...message.messageSnapshots.values()] : [];
  const snapshotText = snapshots.map((s) => s.content?.trim()).filter(Boolean).join("\n");
  if (snapshotText) return snapshotText;
  const embed = message?.embeds?.[0];
  return [embed?.title?.trim(), embed?.description?.trim()].filter(Boolean).join("\n");
}

function getFirstAttachment(message) {
  const direct = message?.attachments?.first?.();
  if (direct) return direct;
  const snapshots = message?.messageSnapshots?.values ? [...message.messageSnapshots.values()] : [];
  for (const snap of snapshots) {
    const nested = snap?.attachments?.first?.();
    if (nested) return nested;
  }
  return null;
}

function parsePollArgs(rawArgs) {
  let text = rawArgs.join(" ");
  let duracion = null;
  let multiple = null;

  const hours = text.match(/--horas\s+(\d+)/i);
  if (hours) {
    duracion = hours[1];
    text = text.replace(hours[0], " ");
  }

  const multi = text.match(/--multi\b/i);
  if (multi) {
    multiple = "true";
    text = text.replace(multi[0], " ");
  }

  const parts = text.split("/").map((s) => s.trim()).filter(Boolean);
  const pregunta = parts.shift() ?? null;
  const opciones = parts.length ? parts.join("/") : null;

  return {
    values: { pregunta, opciones, duracion, multiple },
    missingRequired: !pregunta || !opciones,
    notFound: false,
  };
}

async function parsePrefixedArgsForSlash(ctx, slashCommand, slashName, slashKey = "") {
  const defs = slashCommand?.params?.params ?? [];
  const args = [...(ctx.args ?? [])];
  const replyMsg = ctx?.message?.reference?.messageId
    ? await ctx.message.fetchReference().catch(() => null)
    : null;
  const attachments = [
    ...(ctx.message?.attachments?.values?.() ?? []),
    ...(replyMsg?.attachments?.values?.() ?? []),
  ];
  if (!attachments.length) {
    const fallbackAtt = getFirstAttachment(ctx.message) ?? getFirstAttachment(replyMsg);
    if (fallbackAtt) attachments.push(fallbackAtt);
  }
  const values = {};
  let missingRequired = false;
  let notFound = false;

  if (slashName === "poll") return parsePollArgs(args);

  if (slashName === "purge" && args.length >= 2 && !/^\d{1,3}$/.test(args[0]) && /^\d{1,3}$/.test(args[1])) {
    [args[0], args[1]] = [args[1], args[0]];
  }

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const isLast = i === defs.length - 1;
    const token = args[0];
    let value = null;

    if (def.type === 6) {
      if (token) {
        value = await resolveMemberFlexible(ctx, token, { strictMentionOrId: slashName === "massban" && !def.required });
        if (!value && !def.required && USER_LOOKUP_COMMANDS.has(slashKey)) notFound = true;
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
      value = attachments.shift() ?? buildAttachmentFromUrl(token, def.name);
      if (value && token && value.url === token) args.shift();
    } else if (def.type === 5 || (def.type === 3 && (def.name === "incluir_bots" || def.name === "ignorar_bots"))) {
      if (args.length) {
        value = TRUTHY_TOKENS.includes(String(args.shift()).toLowerCase()) ? "true" : "false";
      }
    } else if (def.type === 3) {
      if (args.length) {
        if (slashName === "translate" && def.name === "texto") {
          const replyText = getMessageText(replyMsg);
          if (args.length === 1 && replyText && TRANSLATE_REPLY_LANGS.has(args[0].toLowerCase())) {
            value = replyText;
          } else if (args.length > 1 && /^[a-z]{2,5}(-[a-z]{2,4})?$/i.test(args[args.length - 1])) {
            const langArg = args.pop();
            value = args.splice(0).join(" ");
            args.push(langArg);
          } else {
            value = args.splice(0).join(" ");
          }
        } else if (def.name === "razon" && defs.some((d) => d.name === "dias") && args.length > 1) {
          if (/^[0-7]$/.test(args[args.length - 1])) {
            const daysArg = args.pop();
            value = args.splice(0).join(" ");
            args.push(daysArg);
          } else {
            value = args.splice(0).join(" ");
          }
        } else if (isLast || slashName === "resume" || slashName === "ask") {
          value = args.splice(0).join(" ");
        } else {
          value = args.shift();
        }
      } else if (def.required && getMessageText(replyMsg)) {
        value = getMessageText(replyMsg);
      } else if (def.required && slashName === "ask" && attachments.length) {
        value = "Analiza esta imagen.";
      } else if (def.required && slashName === "download") {
        const replyAtt = getFirstAttachment(replyMsg);
        if (replyAtt?.url) value = replyAtt.url;
      }
    } else if (args.length) {
      value = args.shift();
    }

    values[def.name] = value ?? null;
    if (def.required && values[def.name] === null) missingRequired = true;
  }

  return { values, missingRequired, notFound };
}

const CTX_I18N_WRAPPED = Symbol.for("redbot.ctxI18nWrapped");

function wrapCtxForLang(ctx, lang) {
  if (lang !== "en" || !ctx || typeof ctx !== "object" || ctx[CTX_I18N_WRAPPED]) return ctx;
  ctx[CTX_I18N_WRAPPED] = true;
  const { translatePayload, wrapInteractionForLang } = require("./i18n");

  const wrapSentMsg = (msg) => {
    if (msg && typeof msg === "object" && typeof msg.edit === "function" && !msg[CTX_I18N_WRAPPED]) {
      msg[CTX_I18N_WRAPPED] = true;
      const origEdit = msg.edit.bind(msg);
      msg.edit = (payload, ...rest) => origEdit(translatePayload(payload, lang), ...rest);
    }
    return msg;
  };

  for (const fnName of ["send", "ephemeral"]) {
    if (typeof ctx[fnName] === "function") {
      const orig = ctx[fnName].bind(ctx);
      ctx[fnName] = async (payload, ...rest) => {
        if (payload && typeof payload === "object" && typeof payload.toPayload === "function") {
          payload._i18nLang = lang;
          return wrapSentMsg(await orig(payload, ...rest));
        }
        return wrapSentMsg(await orig(translatePayload(payload, lang), ...rest));
      };
    }
  }

  if (ctx.interaction) wrapInteractionForLang(ctx.interaction, lang);
  return ctx;
}

function wrapSlashCommand(cmd) {
  const originalCode = cmd?.code;
  if (typeof originalCode !== "function" || wrappedOriginalCodes.has(originalCode)) return;

  cmd.code = async function (ctx, ...args) {
    const { runWithLang } = require("./i18n");
    const { resolveContextLang } = require("./guild");
    const guildId = ctx?.guild?.id ?? ctx?.interaction?.guildId ?? null;
    const userId = ctx?.user?.id ?? ctx?.author?.id ?? ctx?.interaction?.user?.id ?? null;
    const locale = ctx?.interaction?.locale ?? ctx?.interaction?.guildLocale ?? null;
    const lang = await resolveContextLang({ guildId, userId, locale });
    return runWithLang(lang, async () => {
      const langCtx = wrapCtxForLang(ctx, lang);
      const result = await originalCode.call(this, langCtx, ...args);
      await maybeSendReleaseNotice(langCtx);
      return result;
    });
  };

  wrappedOriginalCodes.add(originalCode);
}

function loadSlashCommandMap(log) {
  if (slashCommandMap.size) return;

  const targetDir = path.join(__dirname, "../commands/slash");
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

    try {
      const exported = require(path.join(targetDir, entry.name))?.data;
      const rootData = exported?.data;
      if (Array.isArray(rootData?.commands)) {
        const groupName = rootData.name ?? entry.name.slice(0, -3);
        for (const cmd of rootData.commands) {
          wrapSlashCommand(cmd);
          if (cmd?.data?.name) slashCommandMap.set(`${groupName}/${cmd.data.name}`, cmd);
        }
      } else if (typeof exported?.code === "function") {
        wrapSlashCommand(exported);
      }
    } catch (err) {
      log?.warn(`No se pudo cargar comando slash desde ${entry.name}`, { err: err?.message ?? String(err) });
    }
  }
}

function resolveSlashKeyForPrefixedName(prefixedName) {
  if (PREFIXED_TO_SLASH_MAP[prefixedName]) return PREFIXED_TO_SLASH_MAP[prefixedName];
  const candidates = [...slashCommandMap.keys()].filter((key) => key.endsWith(`/${prefixedName}`));
  return candidates.length === 1 ? candidates[0] : null;
}

async function applyDelegatedCooldown(ctx, slashCommand, slashKey = null) {
  const cooldown = slashCommand?.data?.cooldown;
  const cooldowns = ctx?.bot?.cooldowns;
  if (!cooldown?.seconds || cooldown.seconds <= 0 || !cooldowns) return;

  const { Errors, Cooldowns } = require("gralonium");
  const bucket = cooldown.bucket || "USER";
  const authorId = ctx.author?.id ?? ctx.user?.id ?? "-1";
  let source = authorId;
  if (bucket === "GUILD") source = ctx.guild?.id || "-1";
  else if (bucket === "MEMBER") source = ctx.guild ? `${ctx.guild.id}_${authorId}` : authorId;
  else if (bucket === "CHANNEL") source = ctx.channel?.id || "-1";

  const cooldownMs = cooldown.seconds * 1000;
  const groupName = slashKey?.includes("/") ? slashKey.split("/")[0] : null;
  const cmdKey = typeof Cooldowns?.resolveKey === "function"
    ? Cooldowns.resolveKey(slashCommand, groupName)
    : slashCommand.data.name;
  const active = await cooldowns.check(cmdKey, source, cooldownMs, bucket);
  if (active) throw new Errors.CommandInCooldown(ctx, active.left);

  await cooldowns.setCooldownSource(cmdKey, source, bucket, cooldownMs);
}

async function runCommandPlugins(ctx, slashCommand) {
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
    const prefixedName = command?.data?.name;
    const slashKey = resolveSlashKeyForPrefixedName(prefixedName);
    const slashName = slashKey?.split("/")[1];
    const slashCommand = slashKey ? slashCommandMap.get(slashKey) : null;

    // dmall usa su propio parser (titulo,texto + flags --); no se delega al slash
    if (slashCommand?.code && prefixedName !== "dmall") {
      try {
        const prevCommand = ctx.command;
        ctx.command = slashCommand;
        try {
          if (!(await runCommandPlugins(ctx, slashCommand))) return;
        } finally {
          ctx.command = prevCommand;
        }

        const { runWithLang } = require("./i18n");
        const { resolveContextLang } = require("./guild");
        const lang = await resolveContextLang({
          guildId: ctx?.guild?.id ?? null,
          userId: ctx?.user?.id ?? ctx?.author?.id ?? null,
        });
        wrapCtxForLang(ctx, lang);
        const parsedValues = await parsePrefixedArgsForSlash(ctx, slashCommand, slashName, slashKey);
        if (parsedValues.notFound) return ctx.send(lang === "en" ? "Could not find that user" : "No encontré a ese usuario");
        if (parsedValues.missingRequired) {
          const fallbackResult = await runWithLang(lang, () => originalCode.call(this, ctx, ...args));
          if (fallbackResult !== undefined) return fallbackResult;
          return ctx.send(lang === "en" ? "Missing required parameters to run this command." : "Faltan parámetros requeridos para ejecutar este comando.");
        }

        await applyDelegatedCooldown(ctx, slashCommand, slashKey);

        const prevGet = ctx.get;
        ctx.get = (name) => parsedValues.values[name] ?? null;
        ctx.command = slashCommand;

        try {
          return await slashCommand.code(ctx, ...args);
        } finally {
          ctx.get = prevGet;
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
      const { runWithLang, getCurrentLang } = require("./i18n");
      const { resolveContextLang } = require("./guild");
      const lang = await resolveContextLang({
        guildId: ctx?.guild?.id ?? null,
        userId: ctx?.user?.id ?? ctx?.author?.id ?? null,
      });
      wrapCtxForLang(ctx, lang);
      return await runWithLang(lang, async () => {
        const result = await originalCode.call(this, ctx, ...args);
        await maybeSendReleaseNotice(ctx);
        return result;
      });
    } catch (err) {
      log?.error(`[${command?.data?.name ?? file}]`, { err: err.message });
      const errLang = await require("./guild").resolveContextLang({
        guildId: ctx?.guild?.id ?? null,
        userId: ctx?.user?.id ?? ctx?.author?.id ?? null,
      }).catch(() => getCurrentLang());
      return ctx.send(errLang === "en" ? "An error occurred while running the command" : "Ocurrió un error ejecutando el comando");
    }
  };

  wrappedOriginalCodes.add(originalCode);
}

function wrapPrefixedCommands(log) {
  loadSlashCommandMap(log);

  const prefixedPath = path.join(__dirname, "../commands/prefixed");
  const prefixedFiles = fs.readdirSync(prefixedPath).filter((f) => f.endsWith(".js"));

  for (const file of prefixedFiles) {
    const exported = require(path.join(prefixedPath, file))?.data;
    const list = Array.isArray(exported) ? exported : [exported];
    for (const cmd of list) {
      if (cmd) wrapSingleCommand(cmd, file, log);
    }
  }
}

module.exports = { wrapPrefixedCommands, resolveMemberFlexible, parsePrefixedArgsForSlash, getMessageText };
