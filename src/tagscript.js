const { EmbedBuilder } = require("discord.js");
const { RED } = require("./config");
const { EmbedTemplate } = require("./database");
const { isDbReady, memberHasRole } = require("./shared/utils");

const OPEN_BRACE_SENTINEL = "\uE000";
const CLOSE_BRACE_SENTINEL = "\uE001";
const USER_CONTROLLED_KEYS = new Set([
  "args",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "user.name",
  "user.username",
  "user.tag",
  "server",
  "server.name",
  "channel.name",
]);

function escapeBraces(val) {
  return String(val ?? "")
    .replace(/\{/g, OPEN_BRACE_SENTINEL)
    .replace(/\}/g, CLOSE_BRACE_SENTINEL);
}

function unescapeBraces(val) {
  return String(val ?? "")
    .replaceAll(OPEN_BRACE_SENTINEL, "{")
    .replaceAll(CLOSE_BRACE_SENTINEL, "}");
}

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
  const raw = unescapeBraces(String(expr || "").trim());
  const hasRoleMatch = raw.match(/^hasrole:(\d{17,22})$/i);
  if (hasRoleMatch) {
    return memberHasRole(ctx.member, hasRoleMatch[1]);
  }

  // Evaluar operadores compuestos y "contains" antes de < / > para no partir menciones <@id>
  const opMatchers = [
    [/^(.*?)\s+contains\s+(.*)$/i, (a, b) => a.toLowerCase().includes(b.toLowerCase())],
    [/^(.*?)\s*!=\s*(.*)$/, (a, b) => a !== b],
    [/^(.*?)\s*==\s*(.*)$/, (a, b) => a === b],
    [/^(.*?)\s*>=\s*(.*)$/, (a, b) => Number(a) >= Number(b)],
    [/^(.*?)\s*<=\s*(.*)$/, (a, b) => Number(a) <= Number(b)],
    [/^([^<>]+?)\s*>\s*([^<>]+)$/, (a, b) => Number(a) > Number(b)],
    [/^([^<>]+?)\s*<\s*([^<>]+)$/, (a, b) => Number(a) < Number(b)],
  ];

  for (const [regex, fn] of opMatchers) {
    const match = raw.match(regex);
    if (match && match[1].trim()) {
      const left = unescapeBraces(substituteVars(match[1].trim(), locals));
      const right = unescapeBraces(substituteVars(match[2].trim(), locals));
      return fn(left, right);
    }
  }
  return Boolean(unescapeBraces(substituteVars(raw, locals)));
}

function substituteVars(text, locals, { escapeUserVars = false } = {}) {
  return String(text ?? "").replace(/\{([a-zA-Z0-9_.]+)\}/g, (full, key) => {
    if (!Object.prototype.hasOwnProperty.call(locals, key)) return full;
    const rawVal = String(locals[key]);
    return escapeUserVars && USER_CONTROLLED_KEYS.has(key) ? escapeBraces(rawVal) : rawVal;
  });
}

/**
 * Interprete seguro de TagScript (sin eval): soporta variables, {set}, {if},
 * {rand}, {choose} y bloques de accion {dm}, {addrole}, {removerole}, {react}, {delete}, {embed}.
 * Las variables controladas por el usuario se escapan para impedir inyeccion de directivas.
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
    locals[key] = substituteVars(val.trim(), locals, { escapeUserVars: true });
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

  // Expandir variables escapando llaves de valores de usuario antes de {if} y acciones
  out = substituteVars(out, locals, { escapeUserVars: true });

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

  out = substituteVars(out, locals, { escapeUserVars: true });

  // Bloques de accion (solo del template, nunca inyectables desde {args} o nombres)
  out = out.replace(/\{dm:([^{}]+)\}/gi, (_, msg) => {
    actions.dm = unescapeBraces(msg).trim().slice(0, 1800);
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
    if (actions.reactions.length < 5) actions.reactions.push(unescapeBraces(emoji).trim());
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

  // Restaurar llaves literales provenientes de variables de usuario
  for (const key of Object.keys(locals)) {
    if (typeof locals[key] === "string") {
      locals[key] = unescapeBraces(locals[key]);
    }
  }

  return { text: unescapeBraces(out).trim(), actions, vars: locals };
}

function renderEmbedTemplate(doc, ctx = {}, extraVars = {}) {
  const locals = buildTagVariables(ctx, extraVars);
  const embed = new EmbedBuilder().setColor(safeParseColor(doc?.color, RED));
  if (doc?.title) {
    const title = substituteVars(doc.title, locals).trim().slice(0, 256);
    if (title) embed.setTitle(title);
  }
  if (doc?.description) {
    const desc = substituteVars(doc.description, locals).trim().slice(0, 4000);
    if (desc) embed.setDescription(desc);
  }
  if (doc?.footer) {
    const footer = substituteVars(doc.footer, locals).trim().slice(0, 2048);
    if (footer) embed.setFooter({ text: footer });
  }
  if (doc?.authorName) {
    const author = substituteVars(doc.authorName, locals).trim().slice(0, 256);
    if (author) embed.setAuthor({ name: author });
  }
  if (doc?.image && /^https?:\/\//i.test(doc.image)) embed.setImage(doc.image);
  if (doc?.thumbnail && /^https?:\/\//i.test(doc.thumbnail)) embed.setThumbnail(doc.thumbnail);
  return embed;
}

async function resolveEmbedTemplate(guildId, name, ctx = {}, extraVars = {}) {
  if (!guildId || !name || !isDbReady()) return null;
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
};
