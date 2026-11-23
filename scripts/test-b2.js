const mongoose = require("mongoose");
const { PermissionFlagsBits } = require("discord.js");
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

async function testB2Bug7TicketClaimFilter() {
  const { Ticket, GuildConfig } = require(path.join(ROOT, "src/database"));
  const { invalidateGuildConfigCache } = require(path.join(ROOT, "src/guild"));
  const { data: ticketInteractionModules } = require(path.join(ROOT, "commands/interactions/ticketActions"));
  const buttonData = ticketInteractionModules[0];

  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origFindOne = Ticket.findOne;
  const origUpdateOne = Ticket.updateOne;
  const origGuildFindOne = GuildConfig.findOne;

  let capturedFilter = null;
  let capturedUpdate = null;
  let updateReplyText = null;
  let ephemeralReplyText = null;

  try {
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });
    invalidateGuildConfigCache("g_tkt_7");

    GuildConfig.findOne = () => ({
      select() { return this; },
      lean: async () => ({ guildId: "g_tkt_7", lang: "es", ticketConfig: { welcomeMessage: "Hola" } }),
    });
    Ticket.findOne = () => ({
      lean: async () => ({
        _id: "tkt_doc_1",
        guildId: "g_tkt_7",
        channelId: "ch_tkt_7",
        openerId: "u_open",
        category: "General",
        status: "open",
        number: 7,
      }),
    });
    Ticket.updateOne = async (filter, update) => {
      capturedFilter = filter;
      capturedUpdate = update;
      return { matchedCount: 1, modifiedCount: 1 };
    };

    const makeInteraction = () => ({
      guildId: "g_tkt_7",
      guild: { id: "g_tkt_7", name: "Test" },
      channelId: "ch_tkt_7",
      customId: "tkt:claim",
      user: { id: "u_staff_7" },
      memberPermissions: { has: (p) => p === PermissionFlagsBits.ManageChannels },
      member: { id: "u_staff_7", roles: [] },
      update: async () => { updateReplyText = "updated"; },
      followUp: async () => {},
      reply: async (p) => { ephemeralReplyText = p?.content ?? p; },
    });

    await buttonData.code({}, makeInteraction());
    assertCondition(
      capturedFilter?.channelId === "ch_tkt_7" && capturedFilter?.status === "open",
      `B2 #7: Ticket.updateOne no filtró por status: "open" (${JSON.stringify(capturedFilter)})`
    );
    assertCondition(
      capturedUpdate?.$set?.claimedBy === "u_staff_7" && updateReplyText === "updated",
      "B2 #7: no actualizó claimedBy correctamente"
    );

    // Carrera: si el ticket se cerró entre findOne y updateOne (matchedCount === 0), no debe reclamar
    updateReplyText = null;
    ephemeralReplyText = null;
    Ticket.updateOne = async (filter) => {
      capturedFilter = filter;
      return { matchedCount: 0, modifiedCount: 0 };
    };
    await buttonData.code({}, makeInteraction());
    assertCondition(
      updateReplyText === null && String(ephemeralReplyText).includes("ticket abierto"),
      "B2 #7: reclamó o actualizó card aunque matchedCount fuera 0"
    );
  } finally {
    invalidateGuildConfigCache("g_tkt_7");
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    Ticket.findOne = origFindOne;
    Ticket.updateOne = origUpdateOne;
    GuildConfig.findOne = origGuildFindOne;
  }
}

async function testB2Bug4SendLogTransientErrors() {
  const { Log } = require(path.join(ROOT, "src/database"));
  const { getLogChannelId, sendLog } = require(path.join(ROOT, "src/guild"));

  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origLogFindOne = Log.findOne;
  const origLogDeleteOne = Log.deleteOne;

  let logFindCount = 0;
  let logDeleteCount = 0;

  try {
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });
    Log.findOne = () => {
      logFindCount++;
      return { lean: async () => ({ channelId: "ch_log_1" }) };
    };
    Log.deleteOne = async () => {
      logDeleteCount++;
      return { deletedCount: 1 };
    };

    const makeMockGuild = (id, fetchFn) => ({
      id,
      channels: {
        cache: new Map(),
        fetch: fetchFn,
      },
    });

    // Errores que NO deben borrar Log: 50001, 50013, timeout y 5xx
    const transientErrors = [
      ["50001", Object.assign(new Error("Missing Access"), { code: 50001 })],
      ["50013", Object.assign(new Error("Missing Permissions"), { code: 50013 })],
      ["timeout", new Error("ETIMEDOUT")],
      ["503", Object.assign(new Error("Service Unavailable"), { status: 503 })],
    ];

    for (const [label, err] of transientErrors) {
      const gid = `g_log_${label}`;
      const ok = await sendLog(makeMockGuild(gid, async () => { throw err; }), { title: "test" });
      assertCondition(ok === false, `B2 #4 (${label}): sendLog debió devolver false`);
      assertCondition(logDeleteCount === 0, `B2 #4 (${label}): no debió borrar Log ante error no-10003`);
    }

    // Error 10003 (Unknown Channel): SÍ debe borrar Log e invalidar caché
    const gidDeleted = "g_log_10003";
    const findBefore = logFindCount;
    const ok10003 = await sendLog(
      makeMockGuild(gidDeleted, async () => { throw Object.assign(new Error("Unknown Channel"), { code: 10003 }); }),
      { title: "test" }
    );
    assertCondition(ok10003 === false && logDeleteCount === 1, "B2 #4 (10003): debió borrar Log ante Unknown Channel 10003");
    assertCondition(logFindCount === findBefore + 1, "B2 #4 (10003): debió consultar Log inicialmente");
    await getLogChannelId(gidDeleted);
    assertCondition(logFindCount === findBefore + 2, "B2 #4 (10003): no invalidó logChannelCache tras borrar");
  } finally {
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    Log.findOne = origLogFindOne;
    Log.deleteOne = origLogDeleteOne;
  }
}

async function runB2Tests() {
  const checks = [
    ["#1 decodeHtmlEntities", testB2Bug1DecodeHtmlEntities],
    ["#7 ticketActions claim", testB2Bug7TicketClaimFilter],
    ["#4 sendLog 10003", testB2Bug4SendLogTransientErrors],
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
