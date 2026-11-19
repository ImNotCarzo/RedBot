const path = require("path");
const fs = require("fs");
const { isPromise } = require("util/types");

const DISCORD_ID_PATTERN = /^\d{17,20}$/;
const RELEASE_NOTICE_VERSION = "0.4.0";
const MAX_SEEN_RELEASE_USERS = 10_000;
const seenReleaseUsers = new Set();
const handledReleaseCtx = new WeakSet();
const WRAPPED_CMD = Symbol.for("redbot.commandWrapped");

function rememberReleaseUser(userId) {
  if (seenReleaseUsers.has(userId)) return;
  if (seenReleaseUsers.size >= MAX_SEEN_RELEASE_USERS) {
    const oldest = seenReleaseUsers.values().next().value;
    if (oldest !== undefined) seenReleaseUsers.delete(oldest);
  }
  seenReleaseUsers.add(userId);
}

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
      "/ai ocr ``.ocr``",
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
    const res = await ReleaseNotice.updateOne(
      { userId, version: RELEASE_NOTICE_VERSION },
      { $setOnInsert: { userId, version: RELEASE_NOTICE_VERSION } },
      { upsert: true }
    );
    rememberReleaseUser(userId);
    if (!res?.upsertedCount) return;

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
  aisearch: "ai/search",
  transcribe: "ai/transcribe",
  ubanner: "user/banner",
  unlock: "channel/unlock",
  user: "user/info",
  uroles: "user/roles",
  userperms: "user/permissions",
  ticket: "tickets/create",
  invites: "community/invites",
  automod: "mod/automod",
  automodai: "mod/automod-ai",
  dramawatcher: "mod/dramawatcher",
  reactionrole: "role/reaction",
  voicerole: "role/voicelink",
  temprole: "role/temprole",
  autopurge: "channel/autopurge",
  sticky: "channel/sticky",
  temp: "channel/temp",
  voicelink: "channel/voicelink",
  voicestatus: "channel/voicestatus",
  ticketsetup: "tickets/setup",
  ticketpanel: "tickets/panel",
  ticketclose: "tickets/close",
  ticketadd: "tickets/add",
  ticketremove: "tickets/remove",
  ticketclaim: "tickets/claim",
  transcript: "tickets/transcript",
  cmdadd: "auto/cmdadd",
  cmdremove: "auto/cmdremove",
  cmdlist: "auto/cmdlist",
  embedadd: "auto/embedadd",
  embedview: "auto/embedview",
  embedremove: "auto/embedremove",
  embedlist: "auto/embedlist",
  timeradd: "auto/timeradd",
  timerremove: "auto/timerremove",
  timerlist: "auto/timerlist",
  ruleadd: "auto/ruleadd",
  ruleremove: "auto/ruleremove",
  rulelist: "auto/rulelist",
  feedadd: "feeds/add",
  feedremove: "feeds/remove",
  feedlist: "feeds/list",
  feedtest: "feeds/test",
  welcome: "community/welcome",
  goodbye: "community/goodbye",
  birthday: "community/birthday",
  birthdays: "community/birthdays",
  birthdaysetup: "community/birthdaysetup",
  invitetop: "community/inviteleaderboard",
  inviteadd: "community/inviteadd",
  invitereward: "community/invitereward",
};

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

  const lower = token.toLowerCase();
  const exactCached = ctx.guild.members.cache.find((m) => {
    const u = m.user?.username?.toLowerCase() ?? "";
    const g = m.user?.globalName?.toLowerCase() ?? "";
    const n = m.nickname?.toLowerCase() ?? "";
    return u === lower || g === lower || n === lower;
  });
  if (exactCached) return exactCached;

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
    const client = ctx.bot ?? ctx.message?.client;
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
  const manager = ctx?.guild?.channels;
  if (!manager || !input) return null;
  const { isObfuscatedChannel } = require("./runtime");
  const entityId = input.match(/^<#(\d{17,20})>$/)?.[1] ?? (DISCORD_ID_PATTERN.test(input) ? input : null);
  if (entityId) {
    const byId = await manager.fetch(entityId).catch(() => null);
    if (byId && !isObfuscatedChannel(byId)) return byId;
  }
  const lower = input.toLowerCase();
  return manager.cache.find((entity) => !isObfuscatedChannel(entity) && entity.name?.toLowerCase?.().includes(lower)) ?? null;
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

const DURATION_TOKEN_RE = /^\d+[smhdwy]$/i;
const CHANNEL_MENTION_RE = /^<#\d{17,20}>$/;
const ROLE_MENTION_RE = /^<@&\d{17,20}>$/;

function extractDashFlags(rawArgs, booleanFlags = new Set()) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const tok = rawArgs[i];
    if (tok.startsWith("--") && tok.length > 2) {
      const eqIdx = tok.indexOf("=");
      if (eqIdx !== -1) {
        flags[tok.slice(2, eqIdx).toLowerCase()] = tok.slice(eqIdx + 1);
        continue;
      }
      const key = tok.slice(2).toLowerCase();
      if (booleanFlags.has(key)) {
        flags[key] = "true";
        continue;
      }
      const parts = [];
      while (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        parts.push(rawArgs[++i]);
      }
      flags[key] = parts.join(" ");
    } else {
      positional.push(tok);
    }
  }
  return { flags, positional };
}

async function parseCustomPrefixedArgs(ctx, slashKey, rawArgs) {
  const { ChannelType } = require("discord.js");
  const { flags, positional } = extractDashFlags(rawArgs, new Set(["probar", "test"]));

  if (slashKey === "mod/automod") {
    const values = {
      estado: flags.estado ?? null,
      accion: flags.accion ?? null,
      antispam: flags.antispam ?? null,
      antiinvites: flags.antiinvites ?? null,
      antilinks: flags.antilinks ?? null,
      anticaps: flags.anticaps ?? null,
      antimentions: flags.antimentions ?? null,
      palabras: flags.palabras ?? null,
      mensaje_custom: flags.mensaje_custom ?? flags.mensaje ?? null,
    };
    for (const tok of positional) {
      const low = tok.toLowerCase();
      if (!values.estado && (low === "on" || low === "off")) values.estado = low;
      else if (!values.accion && ["delete", "warn", "mute", "kick"].includes(low)) values.accion = low;
    }
    return { values, missingRequired: false, notFound: false };
  }

  if (slashKey === "channel/autopurge") {
    const firstLow = positional[0]?.toLowerCase() ?? "";
    let accion = ["set", "remove", "list"].includes(firstLow) ? positional.shift().toLowerCase() : null;
    if (!accion && DURATION_TOKEN_RE.test(firstLow)) accion = "set";
    let tiempo = flags.tiempo ?? null;
    let canal = flags.canal ? await resolveChannelFlexible(ctx, flags.canal) : null;
    let filtro = flags.filtro ?? null;
    for (const tok of positional) {
      const low = tok.toLowerCase();
      if (!filtro && ["all", "bots", "humans"].includes(low)) { filtro = low; continue; }
      if (!canal && (CHANNEL_MENTION_RE.test(tok) || DISCORD_ID_PATTERN.test(tok))) {
        const ch = await resolveChannelFlexible(ctx, tok);
        if (ch) { canal = ch; continue; }
      }
      if (!tiempo && DURATION_TOKEN_RE.test(tok)) { tiempo = tok; continue; }
      if (!canal) {
        const ch = await resolveChannelFlexible(ctx, tok);
        if (ch) { canal = ch; continue; }
      }
      if (!tiempo) tiempo = tok;
    }
    return { values: { accion, tiempo, canal, filtro }, missingRequired: !accion, notFound: false };
  }

  if (slashKey === "channel/sticky") {
    const firstLow = positional[0]?.toLowerCase() ?? "";
    const accion = ["set", "remove", "list"].includes(firstLow) ? positional.shift().toLowerCase() : null;
    const embed = flags.embed ?? null;
    let canal = flags.canal ? await resolveChannelFlexible(ctx, flags.canal) : null;
    const msgTokens = [];
    for (const tok of positional) {
      if (!canal && (CHANNEL_MENTION_RE.test(tok) || (accion === "remove" && DISCORD_ID_PATTERN.test(tok)))) {
        const ch = await resolveChannelFlexible(ctx, tok);
        if (ch) { canal = ch; continue; }
      }
      msgTokens.push(tok);
    }
    const mensaje = flags.mensaje ?? (msgTokens.length ? msgTokens.join(" ") : null);
    return { values: { accion, mensaje, embed, canal }, missingRequired: !accion, notFound: false };
  }

  if (slashKey === "channel/temp") {
    const firstLow = positional[0]?.toLowerCase() ?? "";
    const modo = ["timed", "hub", "off"].includes(firstLow) ? positional.shift().toLowerCase() : null;
    let canal_hub = flags.canal_hub || flags.canal ? await resolveChannelFlexible(ctx, flags.canal_hub || flags.canal) : null;
    let duracion = flags.duracion ?? null;
    let tipo = flags.tipo ?? null;
    const nameTokens = [];
    for (const tok of positional) {
      const low = tok.toLowerCase();
      if (modo === "hub" && !canal_hub && (CHANNEL_MENTION_RE.test(tok) || DISCORD_ID_PATTERN.test(tok))) {
        const ch = await resolveChannelFlexible(ctx, tok);
        if (ch) { canal_hub = ch; continue; }
      }
      if (modo === "timed" && !tipo && (low === "text" || low === "voice")) { tipo = low; continue; }
      if (modo === "timed" && !duracion && DURATION_TOKEN_RE.test(tok)) { duracion = tok; continue; }
      nameTokens.push(tok);
    }
    const nombre = flags.nombre ?? (nameTokens.length ? nameTokens.join(" ") : null);
    return { values: { modo, nombre, duracion, tipo, canal_hub }, missingRequired: !modo, notFound: false };
  }

  if (slashKey === "role/reaction") {
    const firstLow = positional[0]?.toLowerCase() ?? "";
    const accion = ["create", "add", "remove", "send", "list", "delete"].includes(firstLow) ? positional.shift().toLowerCase() : null;
    const panel_id = flags.panel_id ?? flags.panel ?? (accion && accion !== "list" ? positional.shift() ?? null : null);
    let rol = flags.rol ? await resolveRoleFlexible(ctx, flags.rol) : null;
    let emoji = flags.emoji ?? null;
    let modo = flags.modo ?? null;
    let duracion = flags.duracion ?? null;
    let canal = flags.canal ? await resolveChannelFlexible(ctx, flags.canal) : null;
    const labelTokens = [];
    for (const tok of positional) {
      const low = tok.toLowerCase();
      if (!canal && CHANNEL_MENTION_RE.test(tok)) {
        const ch = await resolveChannelFlexible(ctx, tok);
        if (ch) { canal = ch; continue; }
      }
      if ((accion === "add" || accion === "remove") && !rol) {
        const r = await resolveRoleFlexible(ctx, tok);
        if (r) { rol = r; continue; }
      }
      if (accion === "create" && !modo && ["normal", "unique", "verify", "temp"].includes(low)) { modo = low; continue; }
      if (accion === "create" && !duracion && DURATION_TOKEN_RE.test(tok)) { duracion = tok; continue; }
      if (accion === "add" && rol && !emoji) { emoji = tok; continue; }
      labelTokens.push(tok);
    }
    const etiqueta = flags.etiqueta ?? flags.label ?? (labelTokens.length ? labelTokens.join(" ") : null);
    return {
      values: { accion, panel_id, rol, emoji, etiqueta, modo, duracion, canal },
      missingRequired: !accion,
      notFound: false,
    };
  }

  if (slashKey === "role/temprole") {
    if (positional.length >= 3 && DURATION_TOKEN_RE.test(positional[positional.length - 1])) {
      const usuario = await resolveMemberFlexible(ctx, positional[0]);
      const duracion = positional[positional.length - 1];
      const rol = await resolveRoleFlexible(ctx, positional.slice(1, -1).join(" "));
      return { values: { usuario, rol, duracion }, missingRequired: !usuario || !rol || !duracion, notFound: false };
    }
    return null;
  }

  if (slashKey === "tickets/setup") {
    let categoria = flags.categoria || flags.cat ? await resolveChannelFlexible(ctx, flags.categoria || flags.cat) : null;
    let logs = flags.logs ? await resolveChannelFlexible(ctx, flags.logs) : null;
    let rol_soporte = flags.rol_soporte || flags.rol ? await resolveRoleFlexible(ctx, flags.rol_soporte || flags.rol) : null;
    const msgTokens = [];
    for (const tok of positional) {
      if (ROLE_MENTION_RE.test(tok) && !rol_soporte) {
        const r = await resolveRoleFlexible(ctx, tok);
        if (r) { rol_soporte = r; continue; }
      }
      if (CHANNEL_MENTION_RE.test(tok) || DISCORD_ID_PATTERN.test(tok)) {
        const ch = await resolveChannelFlexible(ctx, tok);
        if (ch?.type === ChannelType.GuildCategory && !categoria) { categoria = ch; continue; }
        if (ch?.isTextBased?.() && !logs) { logs = ch; continue; }
        const r = !rol_soporte ? await resolveRoleFlexible(ctx, tok) : null;
        if (r) { rol_soporte = r; continue; }
      }
      msgTokens.push(tok);
    }
    const mensaje = flags.mensaje ?? flags.msg ?? (msgTokens.length ? msgTokens.join(" ") : null);
    return { values: { categoria, logs, rol_soporte, mensaje }, missingRequired: false, notFound: false };
  }

  if (slashKey === "tickets/panel") {
    let canal = flags.canal ? await resolveChannelFlexible(ctx, flags.canal) : null;
    if (!canal && positional[0] && (CHANNEL_MENTION_RE.test(positional[0]) || DISCORD_ID_PATTERN.test(positional[0]))) {
      const ch = await resolveChannelFlexible(ctx, positional[0]);
      if (ch?.isTextBased?.()) { canal = ch; positional.shift(); }
    }
    const rawRest = positional.join(" ").trim();
    const parts = rawRest ? rawRest.split("|").map((s) => s.trim()) : [];
    const titulo = flags.titulo ?? (parts[0] || null);
    const descripcion = flags.descripcion ?? flags.desc ?? (parts[1] || null);
    const categoria = flags.categoria ?? (parts[2] || null);
    const boton = flags.boton ?? flags.button ?? flags.placeholder ?? (parts[3] || null);
    const opciones = flags.opciones ?? flags.menu ?? null;
    return { values: { canal, titulo, descripcion, categoria, boton, opciones }, missingRequired: false, notFound: false };
  }

  if (slashKey === "auto/cmdadd") {
    const disparador = flags.disparador ?? positional.shift() ?? null;
    const respuesta = flags.respuesta ?? (positional.length ? positional.join(" ") : null);
    return {
      values: { disparador, respuesta, tipo: flags.tipo ?? null, embed: flags.embed ?? null },
      missingRequired: !disparador || !respuesta,
      notFound: false,
    };
  }

  if (slashKey === "auto/embedadd") {
    const nombre = flags.nombre ?? positional.shift() ?? null;
    const descripcion = flags.descripcion ?? (positional.length ? positional.join(" ") : null);
    return {
      values: {
        nombre,
        descripcion,
        titulo: flags.titulo ?? null,
        color: flags.color ?? null,
        imagen: flags.imagen ?? null,
        thumbnail: flags.thumbnail ?? null,
        footer: flags.footer ?? null,
      },
      missingRequired: !nombre || !descripcion,
      notFound: false,
    };
  }

  if (slashKey === "auto/timeradd") {
    const canalTok = flags.canal ?? positional.shift() ?? null;
    const canal = canalTok ? await resolveChannelFlexible(ctx, canalTok) : null;
    const intervalo = flags.intervalo ?? positional.shift() ?? null;
    const mensaje = flags.mensaje ?? (positional.length ? positional.join(" ") : null);
    return {
      values: { canal, intervalo, mensaje, embed: flags.embed ?? null },
      missingRequired: !canal || !intervalo,
      notFound: false,
    };
  }

  if (slashKey === "auto/ruleadd") {
    const nombre = flags.nombre ?? positional.shift() ?? null;
    const evento = flags.evento ?? positional.shift() ?? null;
    const condicion = flags.condicion ?? positional.shift() ?? null;
    const accion = flags.accion ?? positional.shift() ?? null;
    let valor_condicion = flags.valor_condicion ?? flags.cond ?? null;
    let valor_accion = flags.valor_accion ?? flags.val ?? null;
    if (positional.length && valor_condicion === null && valor_accion === null) {
      const restStr = positional.join(" ");
      if (restStr.includes("|")) {
        const [cPart, ...aParts] = restStr.split("|");
        valor_condicion = cPart.trim() || null;
        valor_accion = aParts.join("|").trim() || null;
      } else if (condicion === "always" || condicion === "is_bot" || condicion === "not_bot") {
        valor_accion = restStr;
      } else {
        valor_condicion = positional.shift() ?? null;
        valor_accion = positional.length ? positional.join(" ") : null;
      }
    }
    return {
      values: { nombre, evento, condicion, accion, valor_condicion, valor_accion },
      missingRequired: !nombre || !evento || !condicion || !accion,
      notFound: false,
    };
  }

  if (slashKey === "community/welcome" || slashKey === "community/goodbye") {
    let estado = flags.estado ?? null;
    let canal = flags.canal ? await resolveChannelFlexible(ctx, flags.canal) : null;
    let probar = flags.probar ?? flags.test ?? null;
    const msgTokens = [];
    for (const tok of positional) {
      const low = tok.toLowerCase();
      if (!estado && (low === "on" || low === "off")) { estado = low; continue; }
      if (!probar && (low === "probar" || low === "test")) { probar = "true"; continue; }
      if (!canal && (CHANNEL_MENTION_RE.test(tok) || DISCORD_ID_PATTERN.test(tok))) {
        const ch = await resolveChannelFlexible(ctx, tok);
        if (ch) { canal = ch; continue; }
      }
      msgTokens.push(tok);
    }
    const mensaje = flags.mensaje ?? (msgTokens.length ? msgTokens.join(" ") : null);
    const values = { estado, canal, mensaje, embed: flags.embed ?? null, probar };
    if (slashKey === "community/welcome") values.dm = flags.dm ?? null;
    return { values, missingRequired: false, notFound: false };
  }

  if (slashKey === "community/birthday") {
    if (positional.length === 1 && /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(positional[0])) {
      const [dia, mes, anio] = positional[0].split(/[/-]/);
      return { values: { dia, mes, anio: anio ?? null }, missingRequired: false, notFound: false };
    }
    return null;
  }

  if (slashKey === "community/birthdaysetup") {
    let canal = flags.canal ? await resolveChannelFlexible(ctx, flags.canal) : null;
    let rol = flags.rol ? await resolveRoleFlexible(ctx, flags.rol) : null;
    let estado = flags.estado ?? null;
    const msgTokens = [];
    for (const tok of positional) {
      const low = tok.toLowerCase();
      if (!estado && (low === "on" || low === "off")) { estado = low; continue; }
      if (!canal && (CHANNEL_MENTION_RE.test(tok) || DISCORD_ID_PATTERN.test(tok))) {
        const ch = await resolveChannelFlexible(ctx, tok);
        if (ch) { canal = ch; continue; }
      }
      if (!rol && ROLE_MENTION_RE.test(tok)) {
        const r = await resolveRoleFlexible(ctx, tok);
        if (r) { rol = r; continue; }
      }
      msgTokens.push(tok);
    }
    const mensaje = flags.mensaje ?? (msgTokens.length ? msgTokens.join(" ") : null);
    return { values: { canal, rol, mensaje, estado }, missingRequired: false, notFound: false };
  }

  if (slashKey === "server/custombot") {
    const avatar = flags.avatar ? buildAttachmentFromUrl(flags.avatar, "avatar") : null;
    const banner = flags.banner ? buildAttachmentFromUrl(flags.banner, "banner") : null;
    const apodo = flags.apodo ?? flags.nick ?? (positional.length ? positional.join(" ") : null);
    const biografia = flags.biografia ?? flags.bio ?? null;
    return { values: { avatar, banner, apodo, biografia }, missingRequired: false, notFound: false };
  }

  return null;
}

function validateParsedChoices(defs, values) {
  for (const def of defs) {
    if (!def.choices?.length) continue;
    const raw = values[def.name];
    if (raw === null || raw === undefined || raw === "") continue;
    const normalized = String(raw).toLowerCase().trim();
    const matched = def.choices.find(
      (c) => String(c.value).toLowerCase() === normalized || String(c.name).toLowerCase() === normalized
    );
    if (!matched) {
      return { param: def, choices: def.choices };
    }
    values[def.name] = matched.value;
  }
  return null;
}

async function parsePrefixedArgsForSlash(ctx, slashCommand, slashName, slashKey = "", lang = "es") {
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

  const customParsed = await parseCustomPrefixedArgs(ctx, slashKey, args);
  if (customParsed) {
    if (slashKey === "server/custombot") {
      if (!customParsed.values.avatar && attachments.length) customParsed.values.avatar = attachments.shift();
      if (!customParsed.values.banner && attachments.length) customParsed.values.banner = attachments.shift();
    }
    const invalidChoice = validateParsedChoices(defs, customParsed.values);
    return { ...customParsed, invalidChoice };
  }

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
        else if (def.required && slashName === "rename" && ctx.channel) value = ctx.channel;
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
        } else if (
          isLast ||
          slashName === "resume" ||
          slashName === "ask" ||
          (slashName === "search" && def.name === "consulta") ||
          (slashName === "automod-ai" && def.name === "instruccion") ||
          (slashName === "voicestatus" && def.name === "estado")
        ) {
          value = args.splice(0).join(" ");
        } else {
          value = args.shift();
        }
      } else if (def.required && def.name !== "tiempo" && getMessageText(replyMsg)) {
        value = getMessageText(replyMsg);
      } else if (def.required && slashName === "ask" && attachments.length) {
        value = lang === "en" ? "Analyze this image." : "Analiza esta imagen.";
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

  const invalidChoice = validateParsedChoices(defs, values);
  return { values, missingRequired, notFound, invalidChoice };
}

const CTX_I18N_WRAPPED = Symbol.for("redbot.ctxI18nWrapped");

function wrapCtxForLang(ctx, lang) {
  if (!ctx || typeof ctx !== "object" || ctx[CTX_I18N_WRAPPED]) return ctx;
  ctx[CTX_I18N_WRAPPED] = true;
  const { getCurrentLang, translatePayload, wrapInteractionForLang } = require("./i18n");

  const activeLang = () => getCurrentLang() || lang;

  const wrapSentMsg = (msg) => {
    if (msg && typeof msg === "object" && typeof msg.edit === "function" && !msg[CTX_I18N_WRAPPED]) {
      msg[CTX_I18N_WRAPPED] = true;
      const origEdit = msg.edit.bind(msg);
      msg.edit = (payload, ...rest) => {
        const cur = activeLang();
        return origEdit(cur === "en" ? translatePayload(payload, cur) : payload, ...rest);
      };
    }
    return msg;
  };

  // En Gralonium, ctx.ephemeral() y ctx.reply() delegan internamente en ctx.send(),
  // por lo que envolver solo send evita traducciones duplicadas.
  if (typeof ctx.send === "function") {
    const origSend = ctx.send.bind(ctx);
    ctx.send = async (payload, ...rest) => {
      const cur = activeLang();
      if (payload && typeof payload === "object" && typeof payload.toPayload === "function") {
        payload._i18nLang = cur;
        return wrapSentMsg(await origSend(payload, ...rest));
      }
      return wrapSentMsg(await origSend(cur === "en" ? translatePayload(payload, cur) : payload, ...rest));
    };
  }

  if (ctx.interaction && lang === "en") wrapInteractionForLang(ctx.interaction, lang);
  return ctx;
}

function wrapSlashCommand(cmd) {
  const originalCode = cmd?.code;
  if (typeof originalCode !== "function" || originalCode[WRAPPED_CMD]) return;

  const wrapped = async function (ctx, ...args) {
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
  wrapped[WRAPPED_CMD] = true;
  cmd.code = wrapped;
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
          if (cmd?.data?.name) slashCommandMap.set(`${groupName}/${cmd.data.name}`, { command: cmd, group: exported });
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

async function runDelegatedPreChecks(ctx, slashCommand, slashGroup) {
  const { Errors } = require("gralonium");

  if ((slashGroup?.data?.guildOnly === true || slashCommand?.data?.guildOnly === true) && !ctx.guild) {
    throw new Errors.GuildOnly(ctx);
  }

  if (ctx.guild) {
    const userPerms = [...(slashGroup?.data?.userPermissions ?? []), ...(slashCommand?.data?.userPermissions ?? [])];
    if (userPerms.length && !ctx.member?.permissions?.has?.(userPerms)) {
      throw new Errors.MissingPermission(ctx, userPerms);
    }
    const botPerms = [...(slashGroup?.data?.botPermissions ?? []), ...(slashCommand?.data?.botPermissions ?? [])];
    if (botPerms.length && !ctx.guild.members.me?.permissions?.has?.(botPerms)) {
      throw new Errors.MissingBotPermission(ctx, botPerms);
    }
  }

  for (const plugin of slashCommand?.plugins ?? []) {
    const fn = isPromise(plugin) ? await plugin : plugin;
    if (!(await fn(ctx))) return false;
  }

  const guards = [...(slashGroup?.data?.guards ?? []), ...(slashCommand?.data?.guards ?? [])];
  for (const guard of guards) {
    if (!guard) continue;
    if (!(await guard(ctx))) return false;
  }

  return true;
}

function wrapSingleCommand(command, file, log) {
  const originalCode = command?.code;
  if (typeof originalCode !== "function" || originalCode[WRAPPED_CMD]) return;

  const wrapped = async function (ctx, ...args) {
    const prefixedName = command?.data?.name;
    const slashKey = resolveSlashKeyForPrefixedName(prefixedName);
    const slashName = slashKey?.split("/")[1];
    const slashEntry = slashKey ? slashCommandMap.get(slashKey) : null;
    const slashCommand = slashEntry?.command ?? null;
    const slashGroup = slashEntry?.group ?? null;

    // dmall usa su propio parser (titulo,texto + flags --); no se delega al slash
    if (slashCommand?.code && prefixedName !== "dmall") {
      try {
        const prevCommand = ctx.command;
        ctx.command = slashCommand;
        try {
          if (!(await runDelegatedPreChecks(ctx, slashCommand, slashGroup))) return;
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
        const parsedValues = await parsePrefixedArgsForSlash(ctx, slashCommand, slashName, slashKey, lang);
        if (parsedValues.notFound) return ctx.send(lang === "en" ? "Could not find that user" : "No encontré a ese usuario");
        if (parsedValues.invalidChoice) {
          const { Errors } = require("gralonium");
          throw new Errors.InvalidParamChoice(ctx, parsedValues.invalidChoice.param, parsedValues.invalidChoice.choices);
        }
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
        const { Errors } = require("gralonium");
        const isExpectedFrameworkError =
          (Errors?.MissingPermission && err instanceof Errors.MissingPermission) ||
          (Errors?.MissingBotPermission && err instanceof Errors.MissingBotPermission) ||
          (Errors?.MissingChannelPermission && err instanceof Errors.MissingChannelPermission) ||
          (Errors?.MissingBotChannelPermission && err instanceof Errors.MissingBotChannelPermission) ||
          (Errors?.CommandInCooldown && err instanceof Errors.CommandInCooldown) ||
          (Errors?.GuildOnly && err instanceof Errors.GuildOnly) ||
          (Errors?.NotOwner && err instanceof Errors.NotOwner) ||
          (Errors?.OnlyForIDs && err instanceof Errors.OnlyForIDs) ||
          (Errors?.NotNSFW && err instanceof Errors.NotNSFW) ||
          (Errors?.NotInChannelType && err instanceof Errors.NotInChannelType) ||
          (Errors?.RestrictedUser && err instanceof Errors.RestrictedUser) ||
          (Errors?.RestrictedGuild && err instanceof Errors.RestrictedGuild) ||
          (Errors?.InvalidParam && err instanceof Errors.InvalidParam) ||
          (Errors?.InvalidParamChoice && err instanceof Errors.InvalidParamChoice);
        if (!isExpectedFrameworkError) {
          const { sanitizeError } = require("./runtime");
          log?.error(`[adapter:${slashName ?? prefixedName ?? "unknown"}]`, {
            err: sanitizeError(err),
          });
        }
        throw err;
      }
    }

    const { runWithLang, getCurrentLang } = require("./i18n");
    const { resolveContextLang } = require("./guild");
    try {
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
      const { sanitizeError } = require("./runtime");
      log?.error(`[${command?.data?.name ?? file}]`, { err: sanitizeError(err) });
      const errLang = await resolveContextLang({
        guildId: ctx?.guild?.id ?? null,
        userId: ctx?.user?.id ?? ctx?.author?.id ?? null,
      }).catch(() => getCurrentLang());
      return ctx.send(errLang === "en" ? "An error occurred while running the command" : "Ocurrió un error ejecutando el comando");
    }
  };
  wrapped[WRAPPED_CMD] = true;
  command.code = wrapped;
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

module.exports = { wrapPrefixedCommands, resolveMemberFlexible, getMessageText };
