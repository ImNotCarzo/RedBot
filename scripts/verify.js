/**
 * Script de verificación previa al despliegue de RedBot.
 * Comprueba:
 *  1. Sintaxis (`node --check`) de todos los archivos `.js`.
 *  2. Conteos estructurales: 12 raíces slash (128 subcomandos), 128 comandos con prefijo,
 *     12 módulos de interacción (6 menús contextuales), 24 listeners de eventos (15 archivos)
 *     y paridad 1:1 con `commands/slash/help.js`.
 *  3. Integridad y comparación de `i18n` (`STRINGS`, claves `t()`, `localizeCommand` y `translatePayload`)
 *     frente al commit base `397385c` cuando el historial Git está disponible.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createRequire } = require("module");
const { execFileSync } = require("child_process");
const { createBot } = require("../src/runtime");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_COMMIT = "397385c";
const IGNORE_DIRS = new Set(["node_modules", ".git"]);
const EXPECTED = {
  slashRoots: 12,
  slashSubcommands: 128,
  prefixed: 128,
  helpEntries: 128,
  contextMenus: 6,
  interactions: 12,
  eventFiles: 15,
  eventListeners: 24,
};

function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.name.endsWith(".js")) {
      results.push(full);
    }
  }
  return results.sort();
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function checkSyntax(files) {
  for (const file of files) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  }
  return files.length;
}

function countEventListeners() {
  const eventsDir = path.join(ROOT, "events");
  const eventFiles = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".js")).sort();
  let listenerCount = 0;

  for (const file of eventFiles) {
    const mod = require(path.join(eventsDir, file));
    const data = mod?.data;
    const defs = Array.isArray(data) ? data : data ? [data] : [];
    for (const def of defs) {
      assertCondition(
        Boolean((def?.name || def?.data?.name) && typeof def?.code === "function"),
        `Listener inválido en events/${file}`
      );
      listenerCount++;
    }
  }

  return { eventFiles: eventFiles.length, listenerCount };
}

async function checkCountsAndLoad() {
  const bot = createBot();
  try {
    bot.loader.setLocalizer(null);
    await bot.load(path.join(ROOT, "commands"));
    const rawPayloads = await bot.loader.buildApplicationCommands();

    const slashPayloads = rawPayloads.filter((c) => c.type === 1);
    const contextMenus = rawPayloads.filter((c) => c.type === 2 || c.type === 3);
    const slashSubNames = new Set();

    for (const cmd of slashPayloads) {
      const subs = Array.isArray(cmd.options) ? cmd.options.filter((o) => o.type === 1) : [];
      for (const sub of subs) {
        slashSubNames.add(`${cmd.name} ${sub.name}`);
      }
    }

    assertCondition(
      slashPayloads.length === EXPECTED.slashRoots,
      `Raíces slash: esperadas ${EXPECTED.slashRoots}, encontradas ${slashPayloads.length}`
    );
    assertCondition(
      slashSubNames.size === EXPECTED.slashSubcommands,
      `Subcomandos slash: esperados ${EXPECTED.slashSubcommands}, encontrados ${slashSubNames.size}`
    );
    assertCondition(
      contextMenus.length === EXPECTED.contextMenus,
      `Menús contextuales: esperados ${EXPECTED.contextMenus}, encontrados ${contextMenus.length}`
    );

    const prefixedCatalog = require(path.join(ROOT, "commands/prefixed/catalog"));
    const prefixedCmds = Array.isArray(prefixedCatalog?.data) ? prefixedCatalog.data : [];
    assertCondition(
      prefixedCmds.length === EXPECTED.prefixed,
      `Comandos prefijo: esperados ${EXPECTED.prefixed}, encontrados ${prefixedCmds.length}`
    );

    const seenPrefixedTokens = new Map();
    for (const cmd of prefixedCmds) {
      const name = cmd?.data?.name;
      assertCondition(Boolean(name) && typeof cmd?.code === "function", `Comando prefijo inválido: ${name}`);
      for (const token of [name, ...(cmd.data.aliases || [])]) {
        assertCondition(
          !seenPrefixedTokens.has(token),
          `Colisión de nombre/alias prefijo "${token}" entre ${seenPrefixedTokens.get(token)} y ${name}`
        );
        seenPrefixedTokens.set(token, name);
      }
    }

    const { getCommands } = require(path.join(ROOT, "commands/slash/help"));
    const helpCommands = getCommands();
    const helpSlashNames = new Set();
    const prefixedByName = new Map(prefixedCmds.map((c) => [c.data.name, c.data]));
    for (const [cat, group] of Object.entries(helpCommands)) {
      for (const [key, entry] of Object.entries(group)) {
        helpSlashNames.add(entry.slash);
        const prefixed = prefixedByName.get(entry.short);
        assertCondition(
          Boolean(prefixed),
          `help.js (${cat}.${key}) apunta a prefijo inexistente "${entry.short}" en catalog.js`
        );
        assertCondition(
          JSON.stringify(entry.aliases || []) === JSON.stringify(prefixed.aliases || []),
          `Desfase alias help.js vs catalog.js en ${cat}.${key}`
        );
        const usageCmd = String(entry.usage || "").split(/\s+/)[0].replace(/^\./, "");
        assertCondition(
          usageCmd === entry.short,
          `Desfase usage vs short en help.js (${cat}.${key}): "${usageCmd}" vs "${entry.short}"`
        );
      }
    }
    const catalogSrc = fs.readFileSync(path.join(ROOT, "commands/prefixed/catalog.js"), "utf8");
    for (const cmd of prefixedCmds) {
      const { name, aliases = [] } = cmd.data;
      const re = new RegExp(`\\{\\s*name:\\s*"${name}"[^}]*?descriptionText:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "s");
      const m = catalogSrc.match(re);
      if (!m) continue;
      const am = m[1].match(/\*\*Aliases:\*\*\\n([^\n\\]+)/);
      assertCondition(Boolean(am), `Falta sección **Aliases:** en catalog.js para "${name}"`);
      const listed = [...am[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
      assertCondition(
        JSON.stringify(aliases) === JSON.stringify(listed),
        `Desfase **Aliases:** en catalog.js para "${name}": ${JSON.stringify(listed)} vs ${JSON.stringify(aliases)}`
      );
    }
    assertCondition(
      helpSlashNames.size === EXPECTED.helpEntries,
      `Entradas help.js: esperadas ${EXPECTED.helpEntries}, encontradas ${helpSlashNames.size}`
    );
    const missingInHelp = [...slashSubNames].filter((s) => !helpSlashNames.has(s));
    const extraInHelp = [...helpSlashNames].filter((s) => !slashSubNames.has(s));
    assertCondition(
      missingInHelp.length === 0 && extraInHelp.length === 0,
      `Desfase help.js vs slash: faltan=${missingInHelp.join(",")} sobran=${extraInHelp.join(",")}`
    );

    let interactionCount = 0;
    const interactionsDir = path.join(ROOT, "commands/interactions");
    for (const file of fs.readdirSync(interactionsDir).filter((f) => f.endsWith(".js")).sort()) {
      const mod = require(path.join(interactionsDir, file));
      const items = Array.isArray(mod?.data) ? mod.data : mod?.data ? [mod.data] : [];
      interactionCount += items.length;
    }
    assertCondition(
      interactionCount === EXPECTED.interactions,
      `Módulos de interacción: esperados ${EXPECTED.interactions}, encontrados ${interactionCount}`
    );

    const events = countEventListeners();
    assertCondition(
      events.eventFiles === EXPECTED.eventFiles,
      `Archivos de eventos: esperados ${EXPECTED.eventFiles}, encontrados ${events.eventFiles}`
    );
    assertCondition(
      events.listenerCount === EXPECTED.eventListeners,
      `Listeners de eventos: esperados ${EXPECTED.eventListeners}, encontrados ${events.listenerCount}`
    );

    return { rawPayloads, helpCommands, slashRoots: slashPayloads.length, slashSubs: slashSubNames.size, prefixed: prefixedCmds.length, contextMenus: contextMenus.length, interactions: interactionCount, events };
  } finally {
    await bot.destroy().catch(() => {});
  }
}

function loadI18nWithInternals(source) {
  const mod = { exports: {} };
  const i18nFile = path.join(ROOT, "src/i18n.js");
  const req = createRequire(i18nFile);
  const exposed = `${source}\nmodule.exports.__internals = { STRINGS, EXACT_ES_TO_EN, PATTERN_ES_TO_EN, COMMAND_DESCRIPTION_ES_TO_EN, CHOICE_NAME_ES_TO_EN, CONTEXT_MENU_NAME_ES_TO_EN, translateText };`;
  vm.runInNewContext(exposed, {
    module: mod,
    exports: mod.exports,
    require: req,
    __filename: i18nFile,
    __dirname: path.dirname(i18nFile),
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
  });
  return mod.exports;
}

function extractPlaceholders(str) {
  return [...String(str).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

function assertLocalizationsComplete(node, trail) {
  if (node.description && (!node.description_localizations?.["en-US"] || !node.description_localizations?.["en-GB"])) {
    throw new Error(`Falta description_localizations EN en ${trail}`);
  }
  if (Array.isArray(node.choices)) {
    for (const c of node.choices) {
      if (!c.name_localizations?.["en-US"] || !c.name_localizations?.["en-GB"]) {
        throw new Error(`Falta choice.name_localizations EN en ${trail} (${c.name})`);
      }
    }
  }
  if (Array.isArray(node.options)) {
    for (const opt of node.options) {
      assertLocalizationsComplete(opt, `${trail}.${opt.name}`);
    }
  }
}

function checkI18n(jsFiles, rawPayloads, helpCommands = {}) {
  const newSource = fs.readFileSync(path.join(ROOT, "src/i18n.js"), "utf8");
  const currentI18n = loadI18nWithInternals(newSource);
  const { STRINGS, EXACT_ES_TO_EN, PATTERN_ES_TO_EN } = currentI18n.__internals;

  const esKeys = Object.keys(STRINGS.es).sort();
  const enKeys = Object.keys(STRINGS.en).sort();
  assertCondition(
    JSON.stringify(esKeys) === JSON.stringify(enKeys),
    `Desfase entre STRINGS.es (${esKeys.length}) y STRINGS.en (${enKeys.length})`
  );

  for (const key of esKeys) {
    assertCondition(
      JSON.stringify(extractPlaceholders(STRINGS.es[key])) === JSON.stringify(extractPlaceholders(STRINGS.en[key])),
      `Placeholders distintos en STRINGS.${key}`
    );
  }

  for (const file of jsFiles) {
    if (path.resolve(file) === __filename) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\(\s*[^,]+,\s*["']([a-z0-9_.]+)["']/g)) {
      const key = m[1];
      assertCondition(
        Object.prototype.hasOwnProperty.call(STRINGS.es, key),
        `Clave t("${key}") inexistente en STRINGS (${path.relative(ROOT, file)})`
      );
    }
  }

  for (const [idx, pair] of PATTERN_ES_TO_EN.entries()) {
    assertCondition(
      Array.isArray(pair) &&
        Object.prototype.toString.call(pair[0]) === "[object RegExp]" &&
        (typeof pair[1] === "string" || typeof pair[1] === "function"),
      `Entrada inválida en PATTERN_ES_TO_EN[${idx}]`
    );
  }

  const localizedCurrent = new Map();
  for (const p of rawPayloads) {
    const loc = currentI18n.localizeCommand(JSON.parse(JSON.stringify(p)));
    if (p.type === 2 || p.type === 3) {
      assertCondition(
        Boolean(loc.name_localizations?.["en-US"] && loc.name_localizations?.["en-GB"]),
        `Falta name_localizations EN en menú contextual "${p.name}"`
      );
    }
    assertLocalizationsComplete(loc, p.name);
    localizedCurrent.set(`${p.type}:${p.name}`, loc);
  }

  let baselineStatus = "omitida";
  let baselineSource = null;
  try {
    baselineSource = execFileSync("git", ["show", `${BASELINE_COMMIT}:src/i18n.js`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    baselineSource = null;
  }

  if (baselineSource) {
    const oldI18n = loadI18nWithInternals(baselineSource);
    const oldInternals = oldI18n.__internals;

    const cmdDiffs = [];
    for (const p of rawPayloads) {
      const oldLoc = oldI18n.localizeCommand(JSON.parse(JSON.stringify(p)));
      const newLoc = localizedCurrent.get(`${p.type}:${p.name}`);
      if (JSON.stringify(oldLoc) !== JSON.stringify(newLoc)) {
        cmdDiffs.push(p.name);
      }
    }
    assertCondition(cmdDiffs.length === 0, `Regresión en localizeCommand vs ${BASELINE_COMMIT}: ${cmdDiffs.join(", ")}`);

    const stringDiffs = [];
    for (const key of Object.keys(STRINGS.es)) {
      if (!Object.prototype.hasOwnProperty.call(oldInternals.STRINGS.es, key)) continue;
      const sampleVars = { perms: "ManageGuild", secs: 5, param: "x", detail: "y", count: 3, duration: "5m", lang: "en" };
      const prev = oldI18n.t("en", key, sampleVars);
      const curr = currentI18n.t("en", key, sampleVars);
      if (prev !== curr) stringDiffs.push(key);
    }
    assertCondition(stringDiffs.length === 0, `Regresión en STRINGS vs ${BASELINE_COMMIT}: ${stringDiffs.join(", ")}`);

    const exactDiffs = [];
    for (const esText of Object.keys(EXACT_ES_TO_EN)) {
      if (!Object.prototype.hasOwnProperty.call(oldInternals.EXACT_ES_TO_EN, esText)) continue;
      const prev = oldI18n.translatePayload({ content: esText }, "en").content;
      const curr = currentI18n.translatePayload({ content: esText }, "en").content;
      if (prev !== curr) exactDiffs.push(esText);
    }
    assertCondition(exactDiffs.length === 0, `Regresión en EXACT_ES_TO_EN vs ${BASELINE_COMMIT}: ${exactDiffs.join(" | ")}`);

    const oldPatternSigs = new Set(
      oldInternals.PATTERN_ES_TO_EN.map((p) => `${p[0].source}__${p[0].flags}__${String(p[1])}`)
    );
    const missingPatternEntries = [];
    for (const pair of PATTERN_ES_TO_EN) {
      const sig = `${pair[0].source}__${pair[0].flags}__${String(pair[1])}`;
      if (!oldPatternSigs.has(sig)) missingPatternEntries.push(pair[0].source);
    }
    assertCondition(
      missingPatternEntries.length === 0,
      `Patrones alterados respecto a ${BASELINE_COMMIT}: ${missingPatternEntries.join(" | ")}`
    );

    const patternSamples = [
      "Moderador: @Mod",
      "Permisos de @User",
      "Canal #general",
      "Página 1/3",
      "Página 1/3 · 30 en total",
      "500 → 120 caracteres",
      "Español (es) → Inglés (en)",
      "No puedes banear al dueño del servidor",
      "No puedo silenciar a alguien con igual o mayor rango que el mío",
      "Fuiste advertido en **Server**",
      "Razón: Spam",
      "Advertencia `abc123` aplicada (total: `2`).",
    ];
    const patternDiffs = [];
    for (const sample of patternSamples) {
      const prev = oldI18n.translatePayload({ content: sample }, "en").content;
      const curr = currentI18n.translatePayload({ content: sample }, "en").content;
      if (prev !== curr) patternDiffs.push(sample);
    }
    assertCondition(patternDiffs.length === 0, `Regresión en PATTERN_ES_TO_EN vs ${BASELINE_COMMIT}: ${patternDiffs.join(" | ")}`);

    const codeDiff = execFileSync(
      "git",
      ["diff", "-U0", BASELINE_COMMIT, "--", "commands/", "events/", "src/", ":(exclude)src/i18n.js"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
    const diffLines = codeDiff.split(/\r?\n/);
    const removedLiterals = new Set();
    for (const line of diffLines) {
      if (!line.startsWith("-") || line.startsWith("---")) continue;
      for (const m of line.matchAll(/"([^"\n]{3,200})"/g)) {
        if (/\s/.test(m[1])) removedLiterals.add(m[1]);
      }
    }
    const addedMessages = new Set();
    for (const line of diffLines) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      if (!/(?:ephemeral\(|replyError\(|ctx\.send\(|return "|error:|Msg\b)/.test(line)) continue;
      for (const m of line.matchAll(/"([^"\n]{3,200})"/g)) {
        const msg = m[1];
        if (!/\s/.test(msg) || removedLiterals.has(msg)) continue;
        if (/^Tickets are disabled in this server\./.test(msg)) continue;
        addedMessages.add(msg);
      }
    }
    const modifiedMsgs = [...addedMessages];
    const missingEn = [];
    for (const msg of modifiedMsgs) {
      if (currentI18n.translatePayload({ content: msg }, "en").content === msg) {
        missingEn.push(msg);
      }
    }
    assertCondition(
      missingEn.length === 0,
      `Mensaje modificado sin traducción EN en src/i18n.js: ${missingEn.map((s) => `"${s}"`).join(", ")}`
    );

    for (const [cat, group] of Object.entries(helpCommands)) {
      for (const [key, entry] of Object.entries(group)) {
        if (entry.aliases?.length) {
          const aliasCodes = entry.aliases.map((a) => `\`.${a}\``).join(", ");
          const trAlias = currentI18n.translatePayload({ content: `> **Alias:** ${aliasCodes}` }, "en").content;
          assertCondition(
            trAlias === `> **Aliases:** ${aliasCodes}`,
            `Traducción EN de alias corrupta en help.js (${cat}.${key}): ${trAlias}`
          );
        }
        const shortPrefix = `.${entry.short}`;
        assertCondition(
          currentI18n.translatePayload({ content: shortPrefix }, "en").content === shortPrefix,
          `short alterado al traducir EN en help.js (${cat}.${key}): ${entry.short}`
        );
        const trUsage = currentI18n.translatePayload({ content: `> **Uso:** \`${entry.usage}\`` }, "en").content;
        assertCondition(
          trUsage.startsWith(`> **Usage:** \`.${entry.short}`),
          `Traducción EN de usage corrupta en help.js (${cat}.${key}): ${trUsage}`
        );
        assertCondition(
          !trUsage.includes("<titulo>"),
          `Placeholder <titulo> sin traducir en help.js (${cat}.${key}): ${trUsage}`
        );
      }
    }

    baselineStatus =
      `0 regresiones vs ${BASELINE_COMMIT} (${Object.keys(EXACT_ES_TO_EN).length} exact, ` +
      `${PATTERN_ES_TO_EN.length}/${oldInternals.PATTERN_ES_TO_EN.length} pattern, ` +
      `${modifiedMsgs.length} msg nuevos verificados, ${localizedCurrent.size} payloads)`;
  }

  return {
    stringsCount: esKeys.length,
    exactCount: Object.keys(EXACT_ES_TO_EN).length,
    patternCount: PATTERN_ES_TO_EN.length,
    baselineStatus,
  };
}

async function main() {
  const jsFiles = collectJsFiles(ROOT);
  const checkedFiles = checkSyntax(jsFiles);
  console.log(`[OK] Sintaxis: ${checkedFiles} archivos .js válidos`);

  const counts = await checkCountsAndLoad();
  console.log(
    `[OK] Conteos: ${counts.slashRoots} raíces / ${counts.slashSubs} subcomandos slash, ` +
    `${counts.prefixed} prefijo, ${counts.contextMenus} menús (${counts.interactions} interacciones), ` +
    `${counts.events.listenerCount} eventos en ${counts.events.eventFiles} archivos`
  );

  const i18nStats = checkI18n(jsFiles, counts.rawPayloads, counts.helpCommands);
  console.log(
    `[OK] i18n: ${i18nStats.stringsCount} claves STRINGS, ${i18nStats.exactCount} EXACT, ` +
    `${i18nStats.patternCount} PATTERN (${i18nStats.baselineStatus})`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[FAIL] ${err?.message || err}`);
    process.exit(1);
  });
