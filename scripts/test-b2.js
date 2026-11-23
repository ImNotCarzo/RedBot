const { execFileSync } = require("child_process");
const vm = require("vm");
const { createRequire } = require("module");
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

async function testB2Bug5ErrorRulesBaselineComparison() {
  const { Errors } = require("gralonium");
  const { data: currErrorEvent } = require(path.join(ROOT, "events/error"));

  // Cargar baseline 397385c:events/error.js con el mismo contexto de runtime/i18n
  const oldSrc = execFileSync("git", ["show", "397385c:events/error.js"], { cwd: ROOT, encoding: "utf8" });
  const baseMod = { exports: {} };
  const errRequire = createRequire(path.join(ROOT, "events/error.js"));
  vm.runInNewContext(oldSrc, {
    module: baseMod,
    exports: baseMod.exports,
    require: errRequire,
    process,
    console,
  });
  const baseErrorEvent = baseMod.exports.data;

  const makeErr = (Type, extra = {}) => Object.assign(Object.create(Type.prototype), extra);
  const runCase = async (eventHandler, err, { hasEmbedLinks = true } = {}) => {
    const sent = [];
    const ctx = {
      channel: {
        permissionsFor: () => ({
          has: (perm) => (perm === "EmbedLinks" ? hasEmbedLinks : true),
        }),
      },
      guild: { id: null, members: { me: {} } },
      user: { id: "u_err_test" },
      send: async (msg) => {
        sent.push(msg);
      },
    };
    await eventHandler.code({ user: { id: "bot_1" } }, Object.assign(err, { ctx }), ctx);
    return sent.length ? sent[0] : null;
  };

  const identicalRules = [
    ["1. GuildOnly", () => makeErr(Errors.GuildOnly)],
    ["2. CommandNotFound (silent)", () => makeErr(Errors.CommandNotFound)],
    ["3. NotOwner", () => makeErr(Errors.NotOwner)],
    ["4. MissingPermission", () => makeErr(Errors.MissingPermission, { permissions: ["BanMembers"] })],
    ["5b. MissingBotPermission explicit", () => makeErr(Errors.MissingBotPermission, { permissions: ["ManageRoles"] })],
    ["6. MissingChannelPermission", () => makeErr(Errors.MissingChannelPermission, { permissions: ["ManageMessages"] })],
    ["7. OnlyForIDs", () => makeErr(Errors.OnlyForIDs)],
    ["8. CommandInCooldown", () => makeErr(Errors.CommandInCooldown, { timeLeft: 4200 })],
    ["9. MissingRequiredParam", () => makeErr(Errors.MissingRequiredParam, { param: { name: "usuario" } })],
    ["10. NotNSFW", () => makeErr(Errors.NotNSFW)],
    ["11. NotInChannelType", () => makeErr(Errors.NotInChannelType)],
    ["12. InvalidParamMember", () => makeErr(Errors.InvalidParamMember)],
    ["13. InvalidParamChannel", () => makeErr(Errors.InvalidParamChannel)],
    ["14. InvalidParamRole", () => makeErr(Errors.InvalidParamRole)],
    ["15. InvalidParam", () => makeErr(Errors.InvalidParam, { message: "valor fuera de rango" })],
    ["16. UnknownCommandError", () => makeErr(Errors.UnknownCommandError)],
  ];

  for (const [label, buildErr] of identicalRules) {
    const baseOut = await runCase(baseErrorEvent, buildErr());
    const currOut = await runCase(currErrorEvent, buildErr());
    assertCondition(
      baseOut === currOut,
      `B2 #5 (${label}): salida difiere del baseline 397385c (${JSON.stringify(currOut)} vs ${JSON.stringify(baseOut)})`
    );
  }

  // Regla 5 (caso 50013 cuando EmbedLinks SÍ está presente): diferencia intencional
  const base50013 = await runCase(baseErrorEvent, Object.assign(new Error("Missing Permissions"), { code: 50013 }), { hasEmbedLinks: true });
  const curr50013 = await runCase(currErrorEvent, Object.assign(new Error("Missing Permissions"), { code: 50013 }), { hasEmbedLinks: true });
  assertCondition(
    typeof base50013 === "string" && base50013.includes("EmbedLinks"),
    `B2 #5: baseline debía reportar EmbedLinks (${base50013})`
  );
  assertCondition(
    typeof curr50013 === "string" && !curr50013.includes("EmbedLinks") && curr50013.includes("los requeridos"),
    `B2 #5 (diferencia intencional regla #5): debía usar fallback genérico sin EmbedLinks (${curr50013})`
  );

  // Cuando EmbedLinks realmente falta, sigue reportándose igual que baseline
  const baseMissingEmbed = await runCase(baseErrorEvent, Object.assign(new Error("Missing Permissions"), { code: 50013 }), { hasEmbedLinks: false });
  const currMissingEmbed = await runCase(currErrorEvent, Object.assign(new Error("Missing Permissions"), { code: 50013 }), { hasEmbedLinks: false });
  assertCondition(
    baseMissingEmbed === currMissingEmbed && String(currMissingEmbed).includes("EmbedLinks"),
    "B2 #5: cuando falta EmbedLinks real, debe seguir reportando EmbedLinks"
  );

  return "16 reglas vs 397385c: 15 idénticas + regla #5 (50013 con EmbedLinks) diff intencional -> fallback genérico";
}

async function testB2Bug6MemberHasRole() {
  const { memberHasRole } = require(path.join(ROOT, "src/shared/utils"));
  const { runTagScript } = require(path.join(ROOT, "src/tagscript"));
  const { Ticket, GuildConfig } = require(path.join(ROOT, "src/database"));
  const { invalidateGuildConfigCache } = require(path.join(ROOT, "src/guild"));
  const { data: ticketInteractionModules } = require(path.join(ROOT, "commands/interactions/ticketActions"));
  const buttonData = ticketInteractionModules[0];

  assertCondition(memberHasRole({ roles: { cache: new Set(["r1"]) } }, "r1") === true, "B2 #6: GuildMember cached falló");
  assertCondition(memberHasRole({ roles: ["r1", "sup_role_1"] }, "sup_role_1") === true, "B2 #6: APIGuildMember roles[] falló");
  assertCondition(memberHasRole({ roles: ["r1"] }, "missing") === false, "B2 #6: APIGuildMember falso positivo");
  assertCondition(memberHasRole(null, "r1") === false && memberHasRole({ roles: [] }, null) === false, "B2 #6: nulidad falló");

  assertCondition(
    runTagScript("{if(hasrole:sup_role_1):OK|NO}", { member: { roles: ["sup_role_1"] } }).text === "OK",
    "B2 #6: tagscript hasrole no soportó APIGuildMember roles[]"
  );

  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origFindOne = Ticket.findOne;
  const origUpdateOne = Ticket.updateOne;
  const origGuildFindOne = GuildConfig.findOne;

  let claimCalled = false;
  try {
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });
    invalidateGuildConfigCache("g_tkt_6");

    GuildConfig.findOne = () => ({
      select() { return this; },
      lean: async () => ({
        guildId: "g_tkt_6",
        lang: "es",
        ticketConfig: { supportRoleId: "sup_role_1", welcomeMessage: "Hola" },
      }),
    });
    Ticket.findOne = () => ({
      lean: async () => ({
        _id: "tkt_doc_6",
        guildId: "g_tkt_6",
        channelId: "ch_tkt_6",
        openerId: "u_open",
        category: "General",
        status: "open",
        number: 6,
      }),
    });
    Ticket.updateOne = async () => {
      claimCalled = true;
      return { matchedCount: 1, modifiedCount: 1 };
    };

    await buttonData.code({}, {
      guildId: "g_tkt_6",
      guild: { id: "g_tkt_6", name: "Test" },
      channelId: "ch_tkt_6",
      customId: "tkt:claim",
      user: { id: "u_support_api" },
      memberPermissions: { has: () => false },
      member: { id: "u_support_api", roles: ["sup_role_1"] },
      update: async () => {},
      followUp: async () => {},
      reply: async () => {},
    });

    assertCondition(claimCalled, "B2 #6: ticketActions no reconoció supportRoleId en APIGuildMember no cacheado");
  } finally {
    invalidateGuildConfigCache("g_tkt_6");
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    Ticket.findOne = origFindOne;
    Ticket.updateOne = origUpdateOne;
    GuildConfig.findOne = origGuildFindOne;
  }
}

async function testB2Bug3AutoRuleMentions() {
  const { AutoRule } = require(path.join(ROOT, "src/database"));
  const { dispatchAutoRules, invalidateAutoRulesCache } = require(path.join(ROOT, "src/automation"));
  const autoGroup = require(path.join(ROOT, "commands/slash/auto")).data.data;
  const subs = autoGroup.commands ?? autoGroup.subcommands ?? [];
  const ruleAddCmd = subs.find((c) => (c.data?.name ?? c.name) === "ruleadd");
  assertCondition(ruleAddCmd, "B2 #3: no se encontró subcomando /auto ruleadd");

  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origAutoFind = AutoRule.find;
  const origAutoFindOne = AutoRule.findOne;
  const origAutoCount = AutoRule.countDocuments;
  const origAutoFindOneAndUpdate = AutoRule.findOneAndUpdate;

  let savedUpdate = null;
  const targetChId = "123456789012345678";
  const targetRoleId = "987654321098765432";
  const triggerRoleId = "555555555555555555";
  const guildId = "g_auto_b2_3";

  try {
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });
    AutoRule.findOne = () => ({ lean: async () => null });
    AutoRule.countDocuments = async () => 0;
    AutoRule.findOneAndUpdate = (_filter, update) => {
      savedUpdate = update.$set;
      return { lean: async () => savedUpdate };
    };

    const roleObj = { id: targetRoleId, position: 5, managed: false };
    const trigRoleObj = { id: triggerRoleId, position: 3, managed: false };
    const chObj = { id: targetChId, isTextBased: () => true };
    const guild = {
      id: guildId,
      ownerId: "u_owner",
      channels: { cache: new Map([[targetChId, chObj]]) },
      roles: {
        cache: new Map([
          [targetRoleId, roleObj],
          [triggerRoleId, trigRoleObj],
        ]),
      },
      members: {
        me: {
          permissions: { has: () => true },
          roles: { highest: { position: 99 } },
        },
      },
    };

    const params = {
      nombre: "regla_mencion",
      evento: "message",
      condicion: "in_channel",
      valor_condicion: `  <#${targetChId}>  `,
      accion: "add_role",
      valor_accion: `<@&${targetRoleId}>`,
    };
    let sentCard = null;
    await ruleAddCmd.code({
      guild,
      member: { id: "u_owner", permissions: { has: () => true } },
      get: (k) => (Object.prototype.hasOwnProperty.call(params, k) ? params[k] : null),
      ephemeral: async (msg) => { throw new Error(`ephemeral inesperado: ${msg}`); },
      send: async (c) => { sentCard = c; },
    });

    assertCondition(
      sentCard && savedUpdate?.conditionValue === targetChId && savedUpdate?.actionValue === targetRoleId,
      `B2 #3 (guardado): no normalizó menciones (${JSON.stringify(savedUpdate)})`
    );

    // También probar envío con send_channel y prefijo <#canal>|texto al guardar
    params.condicion = "has_role";
    params.valor_condicion = `<@&${triggerRoleId}>`;
    params.accion = "send_channel";
    params.valor_accion = `<#${targetChId}>|Hola mundo`;
    await ruleAddCmd.code({
      guild,
      member: { id: "u_owner", permissions: { has: () => true } },
      get: (k) => (Object.prototype.hasOwnProperty.call(params, k) ? params[k] : null),
      ephemeral: async (msg) => { throw new Error(`ephemeral inesperado: ${msg}`); },
      send: async () => {},
    });
    assertCondition(
      savedUpdate?.conditionValue === triggerRoleId && savedUpdate?.actionValue === `${targetChId}|Hola mundo`,
      `B2 #3 (guardado has_role/send_channel): no normalizó (${JSON.stringify(savedUpdate)})`
    );

    // Evaluar reglas heredadas ya guardadas CON menciones sin migrar
    invalidateAutoRulesCache(guildId);
    const addedRoles = [];
    const sentMessages = [];
    AutoRule.find = () => ({
      lean: async () => [
        {
          name: "legacy_in_ch_add_role",
          conditionType: "in_channel",
          conditionValue: `<#${targetChId}>`,
          actionType: "add_role",
          actionValue: `<@&${targetRoleId}>`,
        },
        {
          name: "legacy_has_role_send_ch",
          conditionType: "has_role",
          conditionValue: `<@&${triggerRoleId}>`,
          actionType: "send_channel",
          actionValue: `<#${targetChId}>|Legacy ok`,
        },
      ],
    });

    const targetMember = {
      id: "u_target",
      user: { id: "u_target", bot: false, username: "target" },
      roles: {
        cache: new Set([triggerRoleId]),
        add: async (role) => { addedRoles.push(role.id); },
      },
    };
    const legacyChannel = {
      id: targetChId,
      name: "general",
      isTextBased: () => true,
      send: async (p) => { sentMessages.push(p.content); },
    };
    guild.channels.cache.set(targetChId, legacyChannel);

    await dispatchAutoRules("message", {
      guild,
      member: targetMember,
      channel: legacyChannel,
      message: { author: targetMember.user, member: targetMember, content: "hola" },
    });

    assertCondition(
      addedRoles.includes(targetRoleId) && sentMessages.includes("Legacy ok"),
      `B2 #3 (evaluación legacy): roles=${JSON.stringify(addedRoles)} msgs=${JSON.stringify(sentMessages)}`
    );
  } finally {
    invalidateAutoRulesCache(guildId);
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    AutoRule.find = origAutoFind;
    AutoRule.findOne = origAutoFindOne;
    AutoRule.countDocuments = origAutoCount;
    AutoRule.findOneAndUpdate = origAutoFindOneAndUpdate;
  }
}

async function runB2Tests() {
  const checks = [
    ["#1 decodeHtmlEntities", testB2Bug1DecodeHtmlEntities],
    ["#7 ticketActions claim", testB2Bug7TicketClaimFilter],
    ["#4 sendLog 10003", testB2Bug4SendLogTransientErrors],
    ["#5 error.js 16 reglas", testB2Bug5ErrorRulesBaselineComparison],
    ["#6 memberHasRole APIGuildMember", testB2Bug6MemberHasRole],
    ["#3 auto ruleadd menciones", testB2Bug3AutoRuleMentions],
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
