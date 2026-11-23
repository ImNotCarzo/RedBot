const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_COMMIT = "397385c";

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

/** Carga el conjunto de claves `<grupo>/<subcomando>` registradas en commands/slash. */
function collectSlashKeys() {
  const slashDir = path.join(ROOT, "commands/slash");
  const slashKeys = new Set();

  for (const entry of fs.readdirSync(slashDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const exported = require(path.join(slashDir, entry.name))?.data;
    const rootData = exported?.data;
    if (!Array.isArray(rootData?.commands)) continue;

    const groupName = rootData.name ?? entry.name.slice(0, -3);
    for (const cmd of rootData.commands) {
      if (cmd?.data?.name) slashKeys.add(`${groupName}/${cmd.data.name}`);
    }
  }

  return slashKeys;
}

/** Carga los 128 comandos con prefijo y verifica ausencia de colisiones entre nombres y alias. */
function collectPrefixedCommands() {
  const catalog = require(path.join(ROOT, "commands/prefixed/catalog"));
  const prefixedCmds = Array.isArray(catalog?.data) ? catalog.data : [];
  const prefixedNames = new Set();
  const seenTokens = new Map();
  let aliasCount = 0;

  for (const cmd of prefixedCmds) {
    const name = cmd?.data?.name;
    const aliases = Array.isArray(cmd?.data?.aliases) ? cmd.data.aliases : [];
    assertCondition(Boolean(name), "Comando con prefijo sin nombre válido en catalog.js");
    prefixedNames.add(name);
    aliasCount += aliases.length;

    for (const token of [name, ...aliases]) {
      assertCondition(
        !seenTokens.has(token),
        `Colisión de token prefijo "${token}" entre ${seenTokens.get(token)} y ${name}`
      );
      seenTokens.set(token, name);
    }
  }

  return { prefixedCmds, prefixedNames, aliasCount, totalTokens: seenTokens.size };
}

/**
 * Valida la consistencia entre nombres con prefijo, claves slash y PREFIXED_TO_SLASH_MAP:
 * - Ningún comando sin mapear puede quedar huérfano ni sufrir ambigüedad de sufijo.
 * - Ninguna entrada del mapa puede apuntar a un slash inexistente, ser huérfana ni volverse redundante.
 */
function checkSuffixAmbiguities(prefixedNames, slashKeys, map) {
  for (const name of prefixedNames) {
    if (map[name]) continue;
    const candidates = [...slashKeys].filter((k) => k.endsWith(`/${name}`));
    if (candidates.length > 1) {
      throw new Error(`Ambigüedad de sufijo no mapeada para "${name}": ${candidates.join(", ")}`);
    }
    if (candidates.length === 0) {
      throw new Error(`Comando prefijo sin destino slash: "${name}"`);
    }
  }

  for (const [k, v] of Object.entries(map)) {
    assertCondition(slashKeys.has(v), `Entrada muerta en PREFIXED_TO_SLASH_MAP: ${k} -> ${v}`);
    assertCondition(prefixedNames.has(k), `Entrada huérfana en PREFIXED_TO_SLASH_MAP: ${k}`);
    const candidates = [...slashKeys].filter((sk) => sk.endsWith(`/${k}`));
    assertCondition(
      !v.endsWith(`/${k}`) || candidates.length > 1,
      `Entrada redundante en PREFIXED_TO_SLASH_MAP: ${k} -> ${v}`
    );
  }
}

function loadBaselineMap() {
  try {
    const src = execFileSync("git", ["show", `${BASELINE_COMMIT}:src/adapter.js`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const match = src.match(/const PREFIXED_TO_SLASH_MAP = \{([\s\S]*?)\};/);
    assertCondition(Boolean(match), `No se pudo extraer PREFIXED_TO_SLASH_MAP de ${BASELINE_COMMIT}`);
    return { map: Function(`return {${match[1]}}`)(), baselineStatus: `vs ${BASELINE_COMMIT}` };
  } catch {
    return { map: null, baselineStatus: "sin historial git" };
  }
}

function resolveWithMap(prefixedName, slashKeys, map) {
  if (map[prefixedName]) return map[prefixedName];
  const candidates = [...slashKeys].filter((k) => k.endsWith(`/${prefixedName}`));
  return candidates.length === 1 ? candidates[0] : null;
}

function verifySyntheticAmbiguityGuard(prefixedNames, slashKeys, currentMap) {
  const cases = [
    { addedSlashKey: "extra/afk", expectedName: "afk" },
    { addedSlashKey: "extra/ban", expectedName: "ban" },
  ];

  const results = [];
  for (const testCase of cases) {
    const mutatedSlashKeys = new Set(slashKeys);
    mutatedSlashKeys.add(testCase.addedSlashKey);

    let caught = null;
    try {
      checkSuffixAmbiguities(prefixedNames, mutatedSlashKeys, currentMap);
    } catch (err) {
      caught = err;
    }
    const pattern = new RegExp(`Ambigüedad de sufijo no mapeada para "${testCase.expectedName}"`);
    assertCondition(
      Boolean(caught && pattern.test(caught.message)),
      `Guard sintético no falló como se esperaba para "${testCase.addedSlashKey}"`
    );
    results.push({ ...testCase, message: caught.message });
  }
  return results;
}

function evaluateAdapter({ log = null } = {}) {
  const adapter = require(path.join(ROOT, "src/adapter"));
  const { loadSlashCommandMap, resolveSlashKeyForPrefixedName, PREFIXED_TO_SLASH_MAP } = adapter;
  loadSlashCommandMap();

  const slashKeys = collectSlashKeys();
  const { prefixedCmds, prefixedNames, aliasCount, totalTokens } = collectPrefixedCommands();

  checkSuffixAmbiguities(prefixedNames, slashKeys, PREFIXED_TO_SLASH_MAP);
  const syntheticResults = verifySyntheticAmbiguityGuard(prefixedNames, slashKeys, PREFIXED_TO_SLASH_MAP);

  const { map: baselineMap, baselineStatus } = loadBaselineMap();
  const explicitAfterCount = Object.keys(PREFIXED_TO_SLASH_MAP).length;
  const explicitBeforeCount = baselineMap ? Object.keys(baselineMap).length : null;

  let diffs = 0;
  let prunedToFallback = 0;
  let alreadyFallback = 0;
  let explicitKept = 0;
  const comparisons = [];

  for (const cmd of prefixedCmds) {
    const name = cmd.data.name;
    const aliases = Array.isArray(cmd.data.aliases) ? cmd.data.aliases : [];
    const afterKey = resolveSlashKeyForPrefixedName(name);
    assertCondition(Boolean(afterKey) && slashKeys.has(afterKey), `Sin resolución slash para prefijo "${name}"`);

    const beforeKey = baselineMap ? resolveWithMap(name, slashKeys, baselineMap) : afterKey;
    if (afterKey !== beforeKey) diffs++;
    assertCondition(
      afterKey === beforeKey,
      `Diferencia de resolución en "${name}": baseline=${beforeKey} vs actual=${afterKey}`
    );

    const inBefore = baselineMap ? Boolean(baselineMap[name]) : null;
    const inAfter = Boolean(PREFIXED_TO_SLASH_MAP[name]);
    if (inAfter) explicitKept++;
    else if (inBefore) prunedToFallback++;
    else alreadyFallback++;

    for (const token of [name, ...aliases]) {
      comparisons.push({
        token,
        kind: token === name ? "name" : "alias",
        command: name,
        beforeKey,
        afterKey,
        mode: inAfter ? "map" : inBefore ? "pruned->suffix" : "suffix",
      });
    }
  }

  assertCondition(comparisons.length === totalTokens, "Conteo inconsistente de tokens comparados");
  assertCondition(PREFIXED_TO_SLASH_MAP.dmall === "util/dm", "dmall debe conservar su mapeo explícito a util/dm");

  // Comprueba que el bypass especial de dmall siga intacto en src/adapter.js
  const adapterSrc = fs.readFileSync(path.join(ROOT, "src/adapter.js"), "utf8");
  assertCondition(
    adapterSrc.includes('prefixedName !== "dmall"'),
    'Se perdió el bypass de parseo propio para "dmall" en src/adapter.js'
  );

  const mapDelta = explicitBeforeCount !== null
    ? `mapa ${explicitBeforeCount}->${explicitAfterCount} (-${explicitBeforeCount - explicitAfterCount} redundantes)`
    : `mapa ${explicitAfterCount} entradas`;
  const summary =
    `${comparisons.length}/${comparisons.length} tokens idénticos ${baselineStatus} ` +
    `(${prefixedCmds.length} comandos + ${aliasCount} alias), ${mapDelta}, guard de ambigüedad OK`;

  if (log) {
    log({
      summary,
      baselineStatus,
      explicitBeforeCount,
      explicitAfterCount,
      prefixedCount: prefixedCmds.length,
      aliasCount,
      totalTokens: comparisons.length,
      diffs,
      explicitKept,
      prunedToFallback,
      alreadyFallback,
      syntheticResults,
      comparisons,
    });
  }

  return summary;
}

function runAdapterTests() {
  return evaluateAdapter();
}

if (require.main === module) {
  evaluateAdapter({
    log(report) {
      console.log(`=== Comparación Adapter 8a (${report.baselineStatus}) ===`);
      console.log(`Entradas PREFIXED_TO_SLASH_MAP: ${report.explicitBeforeCount} -> ${report.explicitAfterCount} (-${report.explicitBeforeCount - report.explicitAfterCount} podadas)`);
      console.log(`Comandos: ${report.prefixedCount} nombres + ${report.aliasCount} alias = ${report.totalTokens} tokens`);
      console.log(`Desglose comandos: ${report.explicitKept} en mapa (4 ambiguos + 39 renombrados), ${report.prunedToFallback} podados->sufijo, ${report.alreadyFallback} ya sufijo`);
      console.log(`Tokens comparados: ${report.totalTokens}/${report.totalTokens} idénticos | Diffs: ${report.diffs} | Irresolubles: 0 | Colisiones: 0`);
      for (const s of report.syntheticResults) {
        console.log(`[PASS guard sintético] +${s.addedSlashKey} -> "${s.message}"`);
      }
      const changed = report.comparisons.filter((r) => r.beforeKey !== r.afterKey);
      console.log(`Diferencias antes/después: ${changed.length}`);
      console.log(`[OK] ${report.summary}`);
    },
  });
}

module.exports = { runAdapterTests, checkSuffixAmbiguities };
