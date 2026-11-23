const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function testB2Bug1DecodeHtmlEntities() {
  const { decodeHtmlEntities } = require(path.join(ROOT, "src/shared/utils"));
  assertCondition(
    decodeHtmlEntities("&amp;lt;script&amp;gt;") === "&lt;script&gt;",
    "B2 #1: &amp; no debe provocar doble desescape de &lt;/&gt;"
  );
  assertCondition(
    decodeHtmlEntities("&amp;quot;hi&amp;quot;") === "&quot;hi&quot;",
    "B2 #1: &amp; no debe provocar doble desescape de &quot;"
  );
  assertCondition(
    decodeHtmlEntities("<![CDATA[ A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#x27; &#x2F; ]]>", { stripCdata: true, trim: true }) ===
      'A & B <C> "D" \'E\' /',
    "B2 #1: entidades HTML estándar o stripCdata/trim rotos"
  );
}

async function runB2Tests() {
  const checks = [
    ["#1 decodeHtmlEntities", testB2Bug1DecodeHtmlEntities],
  ];
  const extras = [];
  for (const [, fn] of checks) {
    const info = await fn();
    if (info) extras.push(info);
  }
  return `${checks.length} pruebas (${checks.map(([n]) => n).join(", ")})${extras.length ? ` | ${extras.join(" | ")}` : ""}`;
}

if (require.main === module) {
  runB2Tests()
    .then((summary) => {
      console.log(`[OK] B2: ${summary}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[FAIL] ${err?.message || err}`);
      process.exit(1);
    });
}

module.exports = { runB2Tests };
