/**
 * Script de verificación previa al despliegue de RedBot.
 * Comprueba:
 *  1. Sintaxis (`node --check`) de todos los archivos `.js`.
 *  2. Conteos estructurales: 12 raíces slash (128 subcomandos), 128 comandos con prefijo,
 *     12 módulos de interacción (6 menús contextuales), 24 listeners de eventos (13 archivos)
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
  eventFiles: 13,
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
    const knownEnValues = new Set(Object.values(EXACT_ES_TO_EN));
    const addedMessages = new Set();
    for (const line of diffLines) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      if (!/(?:ephemeral\(|replyError\(|replyEphemeral\(|replyInteractionEphemeral\(|ctx\.send\(|return "|error:|Msg\b)/.test(line)) continue;
      for (const m of line.matchAll(/"([^"\n]{3,200})"/g)) {
        const msg = m[1];
        if (!/\s/.test(msg) || removedLiterals.has(msg) || knownEnValues.has(msg)) continue;
        addedMessages.add(msg);
      }
    }

    const extractInlineBilingualPairs = (src) => {
      const pairs = [];
      const nestedRe =
        /(?:isEn|lang\s*===\s*["']en["'])\s*\?\s*\(\s*\w+\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\)\s*:\s*\(\s*\w+\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\)/g;
      for (const m of src.matchAll(nestedRe)) {
        pairs.push([m[1], m[3]], [m[2], m[4]]);
      }
      const simpleRe =
        /(?:isEn|(?:lang|currentLang|nextLang|active)\s*===\s*["']en["'])\s*\?\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1\s*:\s*(["'`])((?:\\.|(?!\3)[^\\])*)\3/g;
      for (const m of src.matchAll(simpleRe)) {
        pairs.push([m[2], m[4]]);
      }
      return pairs;
    };

    const inlineFiles = [
      "events/messageCreate.js",
      "commands/interactions/dramaWatcher.js",
      "commands/interactions/reactionRoles.js",
      "commands/interactions/reminderSnooze.js",
      "commands/interactions/ticketActions.js",
    ];
    let verifiedInlinePairs = 0;
    for (const relFile of inlineFiles) {
      const currSrc = fs.readFileSync(path.join(ROOT, relFile), "utf8");
      let oldSrc = "";
      try {
        oldSrc = execFileSync("git", ["show", `${BASELINE_COMMIT}:${relFile}`], {
          cwd: ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {}
      const oldPairs = extractInlineBilingualPairs(oldSrc);
      const currPairs = extractInlineBilingualPairs(currSrc);
      const oldEsToEn = new Map(oldPairs.map(([en, es]) => [es, en]));
      const oldEnSet = new Set(oldPairs.map(([en]) => en));

      for (const [en, es] of currPairs) {
        assertCondition(
          Boolean(en && es && en !== es),
          `Par bilingüe inline inválido en ${relFile}: EN="${en}" ES="${es}"`
        );
        verifiedInlinePairs++;
        if (!oldEsToEn.has(es)) {
          assertCondition(
            !oldEnSet.has(en),
            `Texto inline modificado en ${relFile} sin actualizar su par EN: ES="${es}" sigue con EN antiguo="${en}"`
          );
          if (!es.includes("${")) addedMessages.add(es);
        }
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
      `${modifiedMsgs.length} msg nuevos + ${verifiedInlinePairs} pares inline verificados, ${localizedCurrent.size} payloads)`;
  }

  return {
    stringsCount: esKeys.length,
    exactCount: Object.keys(EXACT_ES_TO_EN).length,
    patternCount: PATTERN_ES_TO_EN.length,
    baselineStatus,
  };
}

async function checkSchedulersAndRestoration() {
  const mongoose = require("mongoose");
  const { MAX_TIMEOUT_MS, clearTimerMap, scheduleLongTimeout } = require(path.join(ROOT, "src/shared/utils"));
  const { Reminder, TempBan, TempRole, TempChannel, UserConfig } = require(path.join(ROOT, "src/database"));
  const { restoreReminders, stopReminderTimers } = require(path.join(ROOT, "src/reminders"));
  const { scheduleTempUnban, stopTempBanTimers } = require(path.join(ROOT, "src/moderation"));
  const { restoreTempRoles, stopTempRoleTimers } = require(path.join(ROOT, "src/reactionRoles"));
  const { restoreTempChannels, stopChannelsWorkers } = require(path.join(ROOT, "src/channelsExtra"));

  const origDateNow = Date.now;
  const origSetTimeout = global.setTimeout;
  const origClearTimeout = global.clearTimeout;
  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origUserConfigFindOne = UserConfig.findOne;
  const origReminderFind = Reminder.find;
  const origReminderFindOneAndDelete = Reminder.findOneAndDelete;
  const origTempBanExists = TempBan.exists;
  const origTempBanDeleteOne = TempBan.deleteOne;
  const origTempRoleFind = TempRole.find;
  const origTempRoleFindOne = TempRole.findOne;
  const origTempRoleDeleteOne = TempRole.deleteOne;
  const origTempChannelFind = TempChannel.find;
  const origTempChannelFindOne = TempChannel.findOne;
  const origTempChannelDeleteOne = TempChannel.deleteOne;

  let virtualNow = 1_700_000_000_000;
  let nextTimerId = 1;
  const pendingTimers = new Map();

  const flushMicrotasks = async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  const advanceTimeBy = async (deltaMs) => {
    const targetNow = virtualNow + deltaMs;
    while (true) {
      let earliest = null;
      for (const entry of pendingTimers.values()) {
        if (entry.fireAt <= targetNow && (!earliest || entry.fireAt < earliest.fireAt || (entry.fireAt === earliest.fireAt && entry.id < earliest.id))) {
          earliest = entry;
        }
      }
      if (!earliest) break;
      pendingTimers.delete(earliest.id);
      virtualNow = earliest.fireAt;
      await earliest.fn();
      await flushMicrotasks();
    }
    virtualNow = targetNow;
    await flushMicrotasks();
  };

  try {
    Date.now = () => virtualNow;
    global.setTimeout = (fn, delay = 0, ...args) => {
      const numericDelay = Math.max(0, Number(delay) || 0);
      const id = nextTimerId++;
      const handle = {
        id,
        delay: numericDelay,
        fireAt: virtualNow + numericDelay,
        fn: () => fn(...args),
        unref() {
          return this;
        },
      };
      pendingTimers.set(id, handle);
      return handle;
    };
    global.clearTimeout = (handle) => {
      if (handle && typeof handle.id === "number") {
        pendingTimers.delete(handle.id);
      }
    };

    // 1. Plazo corto (< 24.8 días)
    const testMap = new Map();
    let shortFired = 0;
    scheduleLongTimeout(testMap, "short", virtualNow + 5_000, () => {
      shortFired++;
    });
    assertCondition(testMap.size === 1, "scheduleLongTimeout corto: no registró el timer en el Map");
    await advanceTimeBy(4_999);
    assertCondition(shortFired === 0 && testMap.size === 1, "scheduleLongTimeout corto: disparó antes de tiempo");
    await advanceTimeBy(1);
    assertCondition(shortFired === 1 && testMap.size === 0, "scheduleLongTimeout corto: no disparó al vencer o no limpió el Map");

    // 2. Plazo largo (> 24.8 días: 60 días = 2 tramos MAX_TIMEOUT_MS + 1 tramo final)
    const sixtyDaysMs = 60 * 86_400_000;
    let longFired = 0;
    scheduleLongTimeout(testMap, "long60d", virtualNow + sixtyDaysMs, () => {
      longFired++;
    });
    assertCondition(testMap.get("long60d")?.delay === MAX_TIMEOUT_MS, "scheduleLongTimeout >24.8d: primer tramo no usó MAX_TIMEOUT_MS");
    await advanceTimeBy(MAX_TIMEOUT_MS);
    assertCondition(longFired === 0 && testMap.get("long60d")?.delay === MAX_TIMEOUT_MS, "scheduleLongTimeout >24.8d: no encadenó segundo tramo MAX_TIMEOUT_MS");
    await advanceTimeBy(MAX_TIMEOUT_MS);
    const remainingChunk = sixtyDaysMs - 2 * MAX_TIMEOUT_MS;
    assertCondition(longFired === 0 && testMap.get("long60d")?.delay === remainingChunk, "scheduleLongTimeout >24.8d: tercer tramo con delay incorrecto");
    await advanceTimeBy(remainingChunk - 1);
    assertCondition(longFired === 0, "scheduleLongTimeout >24.8d: disparó 1ms antes del tramo final");
    await advanceTimeBy(1);
    assertCondition(longFired === 1 && testMap.size === 0, "scheduleLongTimeout >24.8d: no disparó al finalizar el último tramo");

    // 3. Cancelación a mitad de un tramo largo
    let cancelFired = 0;
    scheduleLongTimeout(testMap, "cancel40d", virtualNow + 40 * 86_400_000, () => {
      cancelFired++;
    });
    await advanceTimeBy(MAX_TIMEOUT_MS);
    assertCondition(cancelFired === 0 && testMap.has("cancel40d"), "scheduleLongTimeout cancelación: no estaba activo en el segundo tramo");
    clearTimerMap(testMap, "cancel40d");
    await advanceTimeBy(30 * 86_400_000);
    assertCondition(cancelFired === 0 && !testMap.has("cancel40d"), "scheduleLongTimeout cancelación: disparó tras clearTimerMap");

    // 4. Restauración tras reinicio de los 4 schedulers (con plazos > 24.8 días)
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });
    UserConfig.findOne = () => ({ select: () => ({ lean: async () => ({ lang: "es" }) }) });

    const thirtyDaysMs = 30 * 86_400_000;
    const deliveredReminders = [];
    const reminderDocs = [
      { _id: "rem_due", userId: "u1", text: "Vencido", remindAt: new Date(virtualNow - 1_000) },
      { _id: "rem_30d", userId: "u1", text: "En 30d", remindAt: new Date(virtualNow + thirtyDaysMs) },
    ];
    Reminder.find = () => ({ lean: async () => reminderDocs });
    Reminder.findOneAndDelete = ({ _id }) => ({
      lean: async () => reminderDocs.find((d) => d._id === _id) ?? null,
    });

    const unbannedUsers = [];
    const deletedTempBans = [];
    TempBan.exists = async ({ guildId, userId }) => guildId === "g1" && userId === "u_ban";
    TempBan.deleteOne = async ({ guildId, userId }) => {
      deletedTempBans.push(`${guildId}:${userId}`);
    };

    const removedRoles = [];
    const deletedTempRoles = [];
    const tempRoleExpireAt = new Date(virtualNow + thirtyDaysMs);
    TempRole.find = () => ({
      lean: async () => [{ guildId: "g1", userId: "u_role", roleId: "r1", expiresAt: tempRoleExpireAt }],
    });
    TempRole.findOne = () => ({
      lean: async () => ({ guildId: "g1", userId: "u_role", roleId: "r1", expiresAt: tempRoleExpireAt }),
    });
    TempRole.deleteOne = async ({ guildId, userId, roleId }) => {
      deletedTempRoles.push(`${guildId}:${userId}:${roleId}`);
    };

    const deletedChannels = [];
    const deletedTempChannels = [];
    const tempChannelExpireAt = new Date(virtualNow + thirtyDaysMs);
    TempChannel.find = () => ({
      lean: async () => [{ guildId: "g1", channelId: "c_temp", expiresAt: tempChannelExpireAt }],
    });
    TempChannel.findOne = () => ({
      lean: async () => ({ guildId: "g1", channelId: "c_temp", expiresAt: tempChannelExpireAt }),
    });
    TempChannel.deleteOne = async ({ channelId }) => {
      deletedTempChannels.push(channelId);
    };

    const mockGuild = {
      id: "g1",
      members: {
        unban: async (userId) => {
          unbannedUsers.push(userId);
        },
        fetch: async (userId) => ({
          id: userId,
          roles: {
            cache: new Map([["r1", { id: "r1" }]]),
            remove: async (roleId) => {
              removedRoles.push(`${userId}:${roleId}`);
            },
          },
        }),
      },
    };
    const mockClient = {
      users: {
        fetch: async (userId) => ({
          id: userId,
          send: async () => {
            deliveredReminders.push(userId);
          },
        }),
      },
      guilds: {
        cache: new Map([["g1", mockGuild]]),
        fetch: async (guildId) => (guildId === "g1" ? mockGuild : null),
      },
      channels: {
        cache: new Map([
          [
            "c_temp",
            {
              id: "c_temp",
              delete: async () => {
                deletedChannels.push("c_temp");
              },
            },
          ],
        ]),
        fetch: async () => null,
      },
    };

    await restoreReminders(mockClient);
    scheduleTempUnban(mockClient, "g1", "u_ban", new Date(virtualNow + thirtyDaysMs));
    await restoreTempRoles(mockClient);
    await restoreTempChannels(mockClient);
    await flushMicrotasks();

    assertCondition(deliveredReminders.length === 1, "restoreReminders: el recordatorio vencido no se entregó al restaurar");
    assertCondition(
      unbannedUsers.length === 0 && removedRoles.length === 0 && deletedChannels.length === 0,
      "Restauración: algún scheduler de 30d disparó prematuramente en t=0"
    );

    // Avanzar primer tramo (24.85 días): ninguno de los de 30 días debe haber disparado aún
    await advanceTimeBy(MAX_TIMEOUT_MS);
    assertCondition(
      deliveredReminders.length === 1 &&
        unbannedUsers.length === 0 &&
        removedRoles.length === 0 &&
        deletedChannels.length === 0,
      "Restauración >24.8d: algún scheduler de 30d disparó al terminar el primer tramo de 24.8d"
    );

    // Avanzar tramo restante hasta completar los 30 días
    await advanceTimeBy(thirtyDaysMs - MAX_TIMEOUT_MS);
    assertCondition(deliveredReminders.length === 2, "restoreReminders >24.8d: el recordatorio de 30d no se entregó tras 30 días");
    assertCondition(
      unbannedUsers.includes("u_ban") && deletedTempBans.includes("g1:u_ban"),
      "scheduleTempUnban >24.8d: no desbaneó o no limpió TempBan tras 30 días"
    );
    assertCondition(
      removedRoles.includes("u_role:r1") && deletedTempRoles.includes("g1:u_role:r1"),
      "restoreTempRoles >24.8d: no quitó el rol o no limpió TempRole tras 30 días"
    );
    assertCondition(
      deletedChannels.includes("c_temp") && deletedTempChannels.includes("c_temp"),
      "restoreTempChannels >24.8d: no eliminó el canal o no limpió TempChannel tras 30 días"
    );
  } finally {
    stopReminderTimers();
    stopTempBanTimers();
    stopTempRoleTimers();
    stopChannelsWorkers();
    Date.now = origDateNow;
    global.setTimeout = origSetTimeout;
    global.clearTimeout = origClearTimeout;
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    UserConfig.findOne = origUserConfigFindOne;
    Reminder.find = origReminderFind;
    Reminder.findOneAndDelete = origReminderFindOneAndDelete;
    TempBan.exists = origTempBanExists;
    TempBan.deleteOne = origTempBanDeleteOne;
    TempRole.find = origTempRoleFind;
    TempRole.findOne = origTempRoleFindOne;
    TempRole.deleteOne = origTempRoleDeleteOne;
    TempChannel.find = origTempChannelFind;
    TempChannel.findOne = origTempChannelFindOne;
    TempChannel.deleteOne = origTempChannelDeleteOne;
  }
}

async function checkGuildConfigCacheInvalidation() {
  const mongoose = require("mongoose");
  const { PermissionFlagsBits, ChannelType } = require("discord.js");
  const { GuildConfig, Ticket } = require(path.join(ROOT, "src/database"));
  const {
    getGuildConfigCached,
    invalidateGuildConfigCache,
    getPrefix,
    setPrefix,
    getLang,
    setLang,
    getAiContext,
    setAiContext,
    getWarnPolicy,
    setWarnPolicy,
  } = require(path.join(ROOT, "src/guild"));
  const { getAutomodConfig, updateAutomodConfig, getDramaChannelId } = require(path.join(ROOT, "src/moderationExtra"));
  const { getTicketConfig, updateTicketConfig, openTicket } = require(path.join(ROOT, "src/tickets"));
  const { isVoiceAutoStatusEnabled } = require(path.join(ROOT, "src/channelsExtra"));

  const channelSlash = require(path.join(ROOT, "commands/slash/channel")).data.data;
  const communitySlash = require(path.join(ROOT, "commands/slash/community")).data.data;
  const modSlash = require(path.join(ROOT, "commands/slash/mod")).data.data;

  const findSubcommand = (group, name) => {
    const subs = group.commands ?? group.subcommands ?? [];
    return subs.find((c) => (c.data?.name ?? c.name) === name);
  };

  const tempCmd = findSubcommand(channelSlash, "temp");
  const voiceStatusCmd = findSubcommand(channelSlash, "voicestatus");
  const welcomeCmd = findSubcommand(communitySlash, "welcome");
  const goodbyeCmd = findSubcommand(communitySlash, "goodbye");
  const birthdaySetupCmd = findSubcommand(communitySlash, "birthdaysetup");
  const dramaWatcherCmd = findSubcommand(modSlash, "dramawatcher");

  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origFindOne = GuildConfig.findOne;
  const origFindOneAndUpdate = GuildConfig.findOneAndUpdate;
  const origTicketFindOne = Ticket.findOne;
  const origTicketCreate = Ticket.create;

  let findOneCount = 0;
  let updateCount = 0;
  let currentDoc = {};

  const applyDotPatch = (target, patchObj) => {
    const next = structuredClone(target);
    for (const [k, v] of Object.entries(patchObj)) {
      const parts = k.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = cur[parts[i]] && typeof cur[parts[i]] === "object" ? { ...cur[parts[i]] } : {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = v;
    }
    return next;
  };

  try {
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });

    GuildConfig.findOne = ({ guildId }) => {
      findOneCount++;
      const snapshot = { guildId, ...structuredClone(currentDoc) };
      const queryObj = {
        select() {
          return this;
        },
        lean: async () => snapshot,
        then(onFulfilled, onRejected) {
          return Promise.resolve(snapshot).then(onFulfilled, onRejected);
        },
      };
      return queryObj;
    };

    GuildConfig.findOneAndUpdate = ({ guildId }, update = {}) => {
      updateCount++;
      let next = { guildId, ...structuredClone(currentDoc) };
      if (update.$set) next = applyDotPatch(next, update.$set);
      if (update.$inc) {
        for (const [k, delta] of Object.entries(update.$inc)) {
          const parts = k.split(".");
          let cur = next;
          for (let i = 0; i < parts.length - 1; i++) {
            cur[parts[i]] = cur[parts[i]] && typeof cur[parts[i]] === "object" ? { ...cur[parts[i]] } : {};
            cur = cur[parts[i]];
          }
          const leaf = parts[parts.length - 1];
          cur[leaf] = (Number(cur[leaf]) || 0) + Number(delta);
        }
      }
      for (const [k, v] of Object.entries(update)) {
        if (!k.startsWith("$")) next[k] = v;
      }
      currentDoc = next;
      const snapshot = structuredClone(currentDoc);
      return {
        lean: async () => snapshot,
        then(onFulfilled, onRejected) {
          return Promise.resolve(snapshot).then(onFulfilled, onRejected);
        },
      };
    };

    Ticket.findOne = () => ({ lean: async () => null });
    Ticket.create = async (data) => ({ ...data });

    const makeMockCtx = (guildId, params = {}) => ({
      guild: {
        id: guildId,
        name: "TestGuild",
        ownerId: "u_admin",
        roles: { everyone: { id: guildId }, cache: new Map() },
        channels: { cache: new Map() },
      },
      user: { id: "u_admin", tag: "admin#0001", username: "admin" },
      member: {
        id: "u_admin",
        permissions: { has: () => true },
        roles: { highest: { position: 99 }, cache: new Map() },
      },
      get: (k) => (Object.prototype.hasOwnProperty.call(params, k) ? params[k] : null),
      defer: async () => {},
      send: async () => {},
      ephemeral: async () => {},
    });

    const guildId = "g_cache_test";
    const verifyWriteInvalidates = async (label, writeFn, readAndAssertFn) => {
      currentDoc = {
        guildId,
        prefix: ".",
        lang: "es",
        langSource: "auto",
        aiContext: "inicial",
        warnThreshold: 0,
        warnMuteMs: 600_000,
        automodConfig: { enabled: false },
        dramaChannelId: null,
        voiceAutoStatus: false,
        voiceHubId: "vh_old",
        ticketConfig: { enabled: true, counter: 1, categoryId: null },
        welcomeConfig: { enabled: false },
        goodbyeConfig: { enabled: false },
        birthdayConfig: { enabled: false },
      };
      invalidateGuildConfigCache(guildId);
      findOneCount = 0;
      updateCount = 0;

      // Calentar caché unificada y comprobar que múltiples lectores comparten la misma entrada
      await getPrefix(guildId);
      await getLang(guildId);
      await getAiContext(guildId);
      await getWarnPolicy(guildId);
      await getAutomodConfig(guildId);
      await getDramaChannelId(guildId);
      await getTicketConfig(guildId);
      await isVoiceAutoStatusEnabled(guildId);
      assertCondition(
        findOneCount === 1,
        `Caché unificada GuildConfig (${label}): se esperaban 1 lectura DB al calentar, ocurrieron ${findOneCount}`
      );

      const prevUpdates = updateCount;
      await writeFn();
      assertCondition(
        updateCount === prevUpdates + 1,
        `Escritura GuildConfig (${label}): no ejecutó findOneAndUpdate`
      );

      // La siguiente lectura debe consultar DB de nuevo (findOneCount: 1 -> 2) por haberse invalidado la caché
      await readAndAssertFn();
      assertCondition(
        findOneCount === 2,
        `Invalidación GuildConfig (${label}): la caché no se invalidó tras escribir (findOneCount=${findOneCount}, esperado=2)`
      );
    };

    // 1. setLang
    await verifyWriteInvalidates(
      "setLang",
      () => setLang(guildId, "en"),
      async () => {
        const lang = await getLang(guildId);
        assertCondition(lang === "en", "setLang: no devolvió el nuevo idioma tras invalidar");
      }
    );

    // 2. setAiContext
    await verifyWriteInvalidates(
      "setAiContext",
      () => setAiContext(guildId, "contexto actualizado"),
      async () => {
        const ctxText = await getAiContext(guildId);
        assertCondition(ctxText === "contexto actualizado", "setAiContext: no devolvió el nuevo contexto tras invalidar");
      }
    );

    // 3. setWarnPolicy
    await verifyWriteInvalidates(
      "setWarnPolicy",
      () => setWarnPolicy(guildId, { warnThreshold: 4, warnMuteMs: 120_000 }),
      async () => {
        const pol = await getWarnPolicy(guildId);
        assertCondition(pol.warnThreshold === 4 && pol.warnMuteMs === 120_000, "setWarnPolicy: no devolvió la nueva política");
      }
    );

    // 4. setPrefix
    await verifyWriteInvalidates(
      "setPrefix",
      () => setPrefix(guildId, "!"),
      async () => {
        const p = await getPrefix(guildId);
        assertCondition(p === "!", "setPrefix: no devolvió el nuevo prefijo");
      }
    );

    // 5. updateAutomodConfig
    await verifyWriteInvalidates(
      "updateAutomodConfig",
      () => updateAutomodConfig(guildId, { enabled: true }),
      async () => {
        const cfg = await getAutomodConfig(guildId);
        assertCondition(cfg.enabled === true, "updateAutomodConfig: no devolvió automod activado");
      }
    );

    // 6. updateTicketConfig
    await verifyWriteInvalidates(
      "updateTicketConfig",
      () => updateTicketConfig(guildId, { categoryId: "cat_99" }),
      async () => {
        const cfg = await getTicketConfig(guildId);
        assertCondition(cfg.categoryId === "cat_99", "updateTicketConfig: no devolvió la nueva categoría");
      }
    );

    // 7. openTicket
    await verifyWriteInvalidates(
      "openTicket",
      () =>
        openTicket({
          guild: {
            id: guildId,
            roles: { everyone: { id: guildId }, cache: new Map() },
            members: {
              me: { id: "bot_1", permissions: { has: (p) => p === PermissionFlagsBits.ManageChannels } },
            },
            channels: {
              cache: new Map(),
              create: async () => ({ id: "tkt_ch_1", send: async () => {}, delete: async () => {} }),
            },
          },
          user: { id: "u_opener", username: "opener" },
        }),
      async () => {
        const cfg = await getTicketConfig(guildId);
        assertCondition(cfg.counter === 2, "openTicket: no reflejó el incremento de counter tras invalidar");
      }
    );

    // 8. /channel temp (off)
    await verifyWriteInvalidates(
      "/channel temp (off)",
      () => tempCmd.code(makeMockCtx(guildId, { modo: "off" })),
      async () => {
        const doc = await getGuildConfigCached(guildId);
        assertCondition(doc?.voiceHubId === null, "/channel temp (off): no invalidó voiceHubId");
      }
    );

    // 9. /channel temp (hub)
    await verifyWriteInvalidates(
      "/channel temp (hub)",
      () =>
        tempCmd.code(
          makeMockCtx(guildId, {
            modo: "hub",
            canal_hub: { id: "vh_new", type: ChannelType.GuildVoice, parentId: "cat_v" },
            nombre: "Sala {user.username}",
          })
        ),
      async () => {
        const doc = await getGuildConfigCached(guildId);
        assertCondition(doc?.voiceHubId === "vh_new", "/channel temp (hub): no invalidó voiceHubId");
      }
    );

    // 10. /channel voicestatus (modo_auto)
    await verifyWriteInvalidates(
      "/channel voicestatus (modo_auto)",
      () => voiceStatusCmd.code(makeMockCtx(guildId, { modo_auto: "on" })),
      async () => {
        const enabled = await isVoiceAutoStatusEnabled(guildId);
        assertCondition(enabled === true, "/channel voicestatus: no reflejó voiceAutoStatus=true");
      }
    );

    // 11a. /community welcome
    await verifyWriteInvalidates(
      "/community welcome",
      () => welcomeCmd.code(makeMockCtx(guildId, { estado: "on", mensaje: "Hola {user}" })),
      async () => {
        const doc = await getGuildConfigCached(guildId);
        assertCondition(doc?.welcomeConfig?.enabled === true, "/community welcome: no invalidó welcomeConfig");
      }
    );

    // 11b. /community goodbye
    await verifyWriteInvalidates(
      "/community goodbye",
      () => goodbyeCmd.code(makeMockCtx(guildId, { estado: "on", mensaje: "Adiós {user}" })),
      async () => {
        const doc = await getGuildConfigCached(guildId);
        assertCondition(doc?.goodbyeConfig?.enabled === true, "/community goodbye: no invalidó goodbyeConfig");
      }
    );

    // 12. /community birthdaysetup
    await verifyWriteInvalidates(
      "/community birthdaysetup",
      () => birthdaySetupCmd.code(makeMockCtx(guildId, { estado: "on" })),
      async () => {
        const doc = await getGuildConfigCached(guildId);
        assertCondition(doc?.birthdayConfig?.enabled === true, "/community birthdaysetup: no invalidó birthdayConfig");
      }
    );

    // 13. /mod dramawatcher
    await verifyWriteInvalidates(
      "/mod dramawatcher",
      () =>
        dramaWatcherCmd.code(
          makeMockCtx(guildId, {
            accion: "set",
            canal: { id: "ch_drama_1", isTextBased: () => true },
          })
        ),
      async () => {
        const id = await getDramaChannelId(guildId);
        assertCondition(id === "ch_drama_1", "/mod dramawatcher: no invalidó dramaChannelId");
      }
    );
  } finally {
    invalidateGuildConfigCache();
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    GuildConfig.findOne = origFindOne;
    GuildConfig.findOneAndUpdate = origFindOneAndUpdate;
    Ticket.findOne = origTicketFindOne;
    Ticket.create = origTicketCreate;
  }
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

  await checkSchedulersAndRestoration();
  console.log("[OK] Schedulers: scheduleLongTimeout (<24.8d, >24.8d, cancelación) y restauración de 4 servicios verificados");

  await checkGuildConfigCacheInvalidation();
  console.log("[OK] GuildConfig: caché unificada (8 lectores) e invalidación en los 14 flujos de escritura verificadas");

  const { runB2Tests } = require("./test-b2");
  const b2Summary = await runB2Tests();
  console.log(`[OK] B2: ${b2Summary}`);

  const { runAdapterTests } = require("./test-adapter");
  const adapterSummary = runAdapterTests();
  console.log(`[OK] Adapter: ${adapterSummary}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[FAIL] ${err?.message || err}`);
    process.exit(1);
  });
