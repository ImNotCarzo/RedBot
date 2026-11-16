const { EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const { RED } = require("./config");
const { EmbedTemplate } = require("./database");

function safeParseColor(raw, fallback = RED) {
  if (!raw || typeof raw !== "string") return fallback;
  const clean = raw.trim();
  if (/^#?[0-9a-f]{6}$/i.test(clean)) return clean.startsWith("#") ? clean : `#${clean}`;
  return fallback;
}

function buildTagVariables(ctx = {}, vars = {}) {
  const user = ctx.user ?? ctx.author ?? ctx.member?.user ?? null;
  const member = ctx.member ?? null;
  const guild = ctx.guild ?? null;
  const channel = ctx.channel ?? null;
  const args = Array.isArray(ctx.args) ? ctx.args : [];
  const now = new Date();

  const map = {
    user: user ? `<@${user.id}>` : "",
    "user.id": user?.id ?? "",
    "user.name": user?.globalName ?? user?.username ?? "",
    "user.username": user?.username ?? "",
    "user.tag": user?.tag ?? user?.username ?? "",
    "user.mention": user ? `<@${user.id}>` : "",
    "user.avatar": user?.displayAvatarURL?.({ size: 256 }) ?? "",
    member: member ? `<@${member.id}>` : (user ? `<@${user.id}>` : ""),
    server: guild?.name ?? "Discord",
    "server.name": guild?.name ?? "Discord",
    "server.id": guild?.id ?? "",
    "server.members": String(guild?.memberCount ?? 0),
    memberCount: String(guild?.memberCount ?? 0),
    channel: channel ? `<#${channel.id}>` : "",
    "channel.id": channel?.id ?? "",
    "channel.name": channel?.name ?? "",
    "channel.mention": channel ? `<#${channel.id}>` : "",
    args: args.join(" "),
    date: now.toLocaleDateString("es-ES"),
    time: now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    ...vars,
  };

  for (let i = 0; i < 9; i++) {
    map[String(i + 1)] = args[i] ?? "";
  }
  return map;
}

function evaluateCondition(expr, ctx, locals) {
  const raw = String(expr || "").trim();
  const hasRoleMatch = raw.match(/^hasrole:(\d{17,22})$/i);
  if (hasRoleMatch) {
    return Boolean(ctx.member?.roles?.cache?.has(hasRoleMatch[1]));
  }

  for (const [op, fn] of [
    ["!=", (a, b) => a !== b],
    ["==", (a, b) => a === b],
    [">=", (a, b) => Number(a) >= Number(b)],
    ["<=", (a, b) => Number(a) <= Number(b)],
    [">", (a, b) => Number(a) > Number(b)],
    ["<", (a, b) => Number(a) < Number(b)],
    ["contains", (a, b) => a.toLowerCase().includes(b.toLowerCase())],
  ]) {
    const idx = raw.indexOf(op);
    if (idx > 0) {
      const left = substituteVars(raw.slice(0, idx).trim(), locals);
      const right = substituteVars(raw.slice(idx + op.length).trim(), locals);
      return fn(left, right);
    }
  }
  return Boolean(substituteVars(raw, locals));
}

function substituteVars(text, locals) {
  return String(text ?? "").replace(/\{([a-zA-Z0-9_.]+)\}/g, (full, key) =>
    Object.prototype.hasOwnProperty.call(locals, key) ? String(locals[key]) : full
  );
}

/**
 * Interprete seguro de TagScript (sin eval): soporta variables, {set}, {if},
 * {rand}, {choose} y bloques de accion {dm}, {addrole}, {removerole}, {react}, {delete}, {embed}.
 */
function runTagScript(template, ctx = {}, extraVars = {}) {
  const locals = buildTagVariables(ctx, extraVars);
  const actions = {
    dm: null,
    addRoles: [],
    removeRoles: [],
    reactions: [],
    deleteTrigger: false,
    embedNames: [],
  };

  let out = String(template ?? "");

  // {set(var):value}
  out = out.replace(/\{set\(([a-zA-Z0-9_]+)\):([^{}]*)\}/gi, (_, key, val) => {
    locals[key] = substituteVars(val.trim(), locals);
    return "";
  });

  // {rand:min..max}
  out = out.replace(/\{rand:(-?\d+)\.\.(-?\d+)\}/gi, (_, minRaw, maxRaw) => {
    const min = Number.parseInt(minRaw, 10);
    const max = Number.parseInt(maxRaw, 10);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
  });

  // {choose:a|b|c}
  out = out.replace(/\{choose:([^{}]+)\}/gi, (_, list) => {
    const opts = list.split("|").map((s) => s.trim()).filter(Boolean);
    if (!opts.length) return "";
    return opts[Math.floor(Math.random() * opts.length)];
  });

  // Expandir variables antes de evaluar bloques {if(...):then|else}
  out = substituteVars(out, locals);

  // {if(cond):then|else}
  for (let pass = 0; pass < 4; pass++) {
    const prev = out;
    out = out.replace(/\{if\(([^()]+)\):([^{}]*)\}/gi, (_, cond, branch) => {
      const pipeIdx = branch.indexOf("|");
      const thenText = pipeIdx >= 0 ? branch.slice(0, pipeIdx) : branch;
      const elseText = pipeIdx >= 0 ? branch.slice(pipeIdx + 1) : "";
      return evaluateCondition(cond, ctx, locals) ? thenText : elseText;
    });
    if (out === prev) break;
  }

  out = substituteVars(out, locals);

  // Bloques de accion
  out = out.replace(/\{dm:([^{}]+)\}/gi, (_, msg) => {
    actions.dm = msg.trim().slice(0, 1800);
    return "";
  });
  out = out.replace(/\{addrole:(\d{17,22})\}/gi, (_, id) => {
    if (!actions.addRoles.includes(id)) actions.addRoles.push(id);
    return "";
  });
  out = out.replace(/\{removerole:(\d{17,22})\}/gi, (_, id) => {
    if (!actions.removeRoles.includes(id)) actions.removeRoles.push(id);
    return "";
  });
  out = out.replace(/\{react:([^{}\s]+)\}/gi, (_, emoji) => {
    if (actions.reactions.length < 5) actions.reactions.push(emoji.trim());
    return "";
  });
  out = out.replace(/\{embed:([a-zA-Z0-9_-]{1,64})\}/gi, (_, name) => {
    if (!actions.embedNames.includes(name.toLowerCase())) actions.embedNames.push(name.toLowerCase());
    return "";
  });
  out = out.replace(/\{delete\}/gi, () => {
    actions.deleteTrigger = true;
    return "";
  });

  return { text: out.trim(), actions, vars: locals };
}

function renderEmbedTemplate(doc, ctx = {}, extraVars = {}) {
  const locals = buildTagVariables(ctx, extraVars);
  const embed = new EmbedBuilder().setColor(safeParseColor(doc?.color, RED));
  if (doc?.title) embed.setTitle(substituteVars(doc.title, locals).slice(0, 256));
  if (doc?.description) embed.setDescription(substituteVars(doc.description, locals).slice(0, 4000));
  if (doc?.footer) embed.setFooter({ text: substituteVars(doc.footer, locals).slice(0, 2048) });
  if (doc?.authorName) embed.setAuthor({ name: substituteVars(doc.authorName, locals).slice(0, 256) });
  if (doc?.image && /^https?:\/\//i.test(doc.image)) embed.setImage(doc.image);
  if (doc?.thumbnail && /^https?:\/\//i.test(doc.thumbnail)) embed.setThumbnail(doc.thumbnail);
  return embed;
}

async function resolveEmbedTemplate(guildId, name, ctx = {}, extraVars = {}) {
  if (!guildId || !name || mongoose.connection.readyState !== 1) return null;
  const clean = String(name).trim().toLowerCase();
  const doc = await EmbedTemplate.findOne({ guildId, name: clean }).lean().catch(() => null);
  if (!doc) return null;
  return renderEmbedTemplate(doc, ctx, extraVars);
}

module.exports = {
  buildTagVariables,
  substituteVars,
  runTagScript,
  renderEmbedTemplate,
  resolveEmbedTemplate,
  safeParseColor,
};
