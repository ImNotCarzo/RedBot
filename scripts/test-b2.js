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

async function testB2Bug2WarnModCaseSync() {
  const { Warn, ModCase } = require(path.join(ROOT, "src/database"));
  const { removeWarnById, clearWarnsForUser, listUnifiedHistoryForUser } = require(path.join(ROOT, "src/moderation"));

  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origWarnFind = Warn.find;
  const origWarnFindOneAndDelete = Warn.findOneAndDelete;
  const origWarnDeleteMany = Warn.deleteMany;
  const origCaseFind = ModCase.find;
  const origCaseFindOneAndDelete = ModCase.findOneAndDelete;
  const origCaseDeleteMany = ModCase.deleteMany;

  let warnStore = [
    { guildId: "g_mod_2", userId: "u_mod_2", warnId: "W11111", moderator: "m1", reason: "Spam", createdAt: new Date("2026-01-01T10:00:00Z") },
    { guildId: "g_mod_2", userId: "u_mod_2", warnId: "W22222", moderator: "m1", reason: "Flood", createdAt: new Date("2026-01-02T10:00:00Z") },
  ];
  let caseStore = [
    { guildId: "g_mod_2", userId: "u_mod_2", caseId: "W11111", type: "warn", moderator: "m1", reason: "Spam", createdAt: new Date("2026-01-01T10:00:00Z") },
    { guildId: "g_mod_2", userId: "u_mod_2", caseId: "W22222", type: "warn", moderator: "m1", reason: "Flood", createdAt: new Date("2026-01-02T10:00:00Z") },
    { guildId: "g_mod_2", userId: "u_mod_2", caseId: "M33333", type: "mute", moderator: "m1", reason: "Mute previo", createdAt: new Date("2026-01-03T10:00:00Z") },
  ];

  const makeQuery = (arr) => ({
    sort() { return this; },
    lean: async () => [...arr],
  });

  try {
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });

    Warn.find = ({ guildId, userId }) => makeQuery(warnStore.filter((d) => d.guildId === guildId && d.userId === userId));
    ModCase.find = ({ guildId, userId }) => makeQuery(caseStore.filter((d) => d.guildId === guildId && d.userId === userId));

    Warn.findOneAndDelete = async ({ guildId, warnId }) => {
      const idx = warnStore.findIndex((d) => d.guildId === guildId && d.warnId === warnId);
      if (idx < 0) return null;
      return warnStore.splice(idx, 1)[0];
    };
    ModCase.findOneAndDelete = async ({ guildId, type, caseId }) => {
      const idx = caseStore.findIndex((d) => d.guildId === guildId && d.type === type && d.caseId === caseId);
      if (idx < 0) return null;
      return caseStore.splice(idx, 1)[0];
    };
    Warn.deleteMany = async ({ guildId, userId }) => {
      const before = warnStore.length;
      warnStore = warnStore.filter((d) => !(d.guildId === guildId && d.userId === userId));
      return { deletedCount: before - warnStore.length };
    };
    ModCase.deleteMany = async ({ guildId, userId, type }) => {
      const before = caseStore.length;
      caseStore = caseStore.filter((d) => !(d.guildId === guildId && d.userId === userId && (!type || d.type === type)));
      return { deletedCount: before - caseStore.length };
    };

    // 1. removeWarnById borra de Warn Y de ModCase
    const rem = await removeWarnById({ guildId: "g_mod_2", warnId: "w11111" });
    assertCondition(rem?.warnId === "W11111", "B2 #2: removeWarnById no devolvió el warn eliminado");
    const histAfterOne = await listUnifiedHistoryForUser({ guildId: "g_mod_2", userId: "u_mod_2" });
    assertCondition(
      histAfterOne.map((c) => c.caseId).join(",") === "M33333,W22222",
      `B2 #2: W11111 siguió apareciendo tras removeWarnById (${JSON.stringify(histAfterOne.map((c) => c.caseId))})`
    );

    // 2. clearWarnsForUser borra warns de Warn Y de ModCase conservando el caso mute M33333
    const cleared = await clearWarnsForUser({ guildId: "g_mod_2", userId: "u_mod_2" });
    assertCondition(cleared === 1, `B2 #2: clearWarnsForUser debía contar 1 eliminado (${cleared})`);
    const histAfterClear = await listUnifiedHistoryForUser({ guildId: "g_mod_2", userId: "u_mod_2" });
    assertCondition(
      histAfterClear.length === 1 && histAfterClear[0].caseId === "M33333",
      `B2 #2: historial tras clearWarns debía conservar solo M33333 (${JSON.stringify(histAfterClear.map((c) => c.caseId))})`
    );
  } finally {
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    Warn.find = origWarnFind;
    Warn.findOneAndDelete = origWarnFindOneAndDelete;
    Warn.deleteMany = origWarnDeleteMany;
    ModCase.find = origCaseFind;
    ModCase.findOneAndDelete = origCaseFindOneAndDelete;
    ModCase.deleteMany = origCaseDeleteMany;
  }
}

async function testB2Bug8ModDossierHierarchy() {
  const { Warn, ModCase } = require(path.join(ROOT, "src/database"));
  const { handleModDossierContext } = require(path.join(ROOT, "src/contextMenus"));
  const { hierarchyChecks } = require(path.join(ROOT, "src/moderation"));

  const origConnDesc = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  const origWarnFind = Warn.find;
  const origWarnCreate = Warn.create;
  const origCaseFind = ModCase.find;

  let collectorHandler = null;
  let timeoutCalls = 0;
  let kickCalls = 0;
  let warnCreateCalls = 0;

  let targetPos = 5;
  const modPos = 10;

  try {
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true, writable: true });
    Warn.find = () => ({ sort() { return this; }, lean: async () => [] });
    ModCase.find = () => ({ sort() { return this; }, lean: async () => [] });
    Warn.create = async () => {
      warnCreateCalls++;
      return {};
    };

    const modMember = {
      id: "u_mod_8",
      permissions: { has: () => true },
      roles: { highest: { position: modPos } },
    };
    const makeTargetMember = () => ({
      id: "u_target_8",
      user: { id: "u_target_8", bot: false, tag: "Target#0008", username: "Target", displayAvatarURL: () => "https://cdn.example.com/a.png" },
      moderatable: true,
      kickable: true,
      roles: { highest: { position: targetPos } },
      timeout: async () => { timeoutCalls++; },
      kick: async () => { kickCalls++; },
    });
    const botMember = {
      id: "bot_8",
      permissions: { has: () => true },
      roles: { highest: { position: 99 } },
    };

    const guild = {
      id: null,
      name: "TestGuild",
      ownerId: "u_owner_8",
      members: {
        me: botMember,
        cache: new Map([["bot_8", botMember], ["u_mod_8", modMember]]),
        fetchMe: async () => botMember,
        fetch: async (id) => {
          if (id === "u_mod_8") return modMember;
          if (id === "u_target_8") return makeTargetMember();
          return null;
        },
      },
    };

    // Comprobar la misma hierarchyChecks directamente
    assertCondition(
      hierarchyChecks({ guild, member: modMember, me: botMember }, makeTargetMember(), "advertir a") === null,
      "B2 #8: hierarchyChecks inicial debía permitir actuar cuando targetPos < modPos"
    );

    const interaction = {
      id: "sess_8",
      guildId: null,
      guild,
      user: { id: "u_mod_8", tag: "Mod#0008", username: "Mod" },
      member: modMember,
      targetUser: { id: "u_target_8", bot: false, tag: "Target#0008", username: "Target", createdTimestamp: 1_700_000_000_000, displayAvatarURL: () => "https://cdn.example.com/a.png" },
      targetMember: makeTargetMember(),
      deferReply: async () => {},
      editReply: async () => ({
        createMessageComponentCollector: () => ({
          on(ev, fn) {
            if (ev === "collect") collectorHandler = fn;
          },
          stop() {},
        }),
      }),
      reply: async () => {},
    };

    await handleModDossierContext(interaction);
    assertCondition(typeof collectorHandler === "function", "B2 #8: no se registró colector del expediente");

    // El objetivo sube de rango por encima del moderador después de abrir el expediente
    targetPos = 15;

    const muteReplies = [];
    await collectorHandler({
      id: "btn_mute_8",
      customId: "modctx:mute:sess_8",
      memberPermissions: { has: () => true },
      member: modMember,
      replied: false,
      deferred: false,
      reply: async (p) => { muteReplies.push(p?.content ?? p); },
      deferUpdate: async () => { throw new Error("No debía hacer deferUpdate en mute inválido"); },
    });
    assertCondition(
      timeoutCalls === 0 && String(muteReplies[0]).includes("rol igual o por encima del tuyo"),
      `B2 #8 (mute): no rechazó por jerarquía (${JSON.stringify(muteReplies)})`
    );

    const kickReplies = [];
    await collectorHandler({
      id: "btn_kick_8",
      customId: "modctx:kick:sess_8",
      memberPermissions: { has: () => true },
      member: modMember,
      replied: false,
      deferred: false,
      showModal: async () => {},
      awaitModalSubmit: async () => ({
        memberPermissions: { has: () => true },
        member: modMember,
        fields: {
          getTextInputValue: () => "Motivo test",
          getCheckbox: () => false,
        },
        reply: async (p) => { kickReplies.push(p?.content ?? p); },
        deferReply: async () => { throw new Error("No debía hacer deferReply en kick inválido"); },
      }),
    });
    assertCondition(
      kickCalls === 0 && String(kickReplies[0]).includes("rol igual o por encima del tuyo"),
      `B2 #8 (kick): no rechazó por jerarquía (${JSON.stringify(kickReplies)})`
    );

    const warnReplies = [];
    await collectorHandler({
      id: "btn_warn_8",
      customId: "modctx:warn:sess_8",
      memberPermissions: { has: () => true },
      member: modMember,
      replied: false,
      deferred: false,
      showModal: async () => {},
      awaitModalSubmit: async () => ({
        memberPermissions: { has: () => true },
        member: modMember,
        fields: {
          getTextInputValue: () => "Motivo warn",
          getCheckbox: () => false,
        },
        reply: async (p) => { warnReplies.push(p?.content ?? p); },
        deferUpdate: async () => { throw new Error("No debía hacer deferUpdate en warn inválido"); },
      }),
    });
    assertCondition(
      warnCreateCalls === 0 && String(warnReplies[0]).includes("rol igual o por encima del tuyo"),
      `B2 #8 (warn): no rechazó por jerarquía (${JSON.stringify(warnReplies)})`
    );
  } finally {
    if (origConnDesc) Object.defineProperty(mongoose.connection, "readyState", origConnDesc);
    else delete mongoose.connection.readyState;
    Warn.find = origWarnFind;
    Warn.create = origWarnCreate;
    ModCase.find = origCaseFind;
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
    ["#2 removewarn/clearwarns ModCase", testB2Bug2WarnModCaseSync],
    ["#8 expediente mod jerarquía", testB2Bug8ModDossierHierarchy],
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
