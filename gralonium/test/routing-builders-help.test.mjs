import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ChannelType,
  Collection,
  InteractionContextType,
  Message,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import {
  CommandBuilder,
  Context,
  Cooldowns,
  EventBuilder,
  Gralonium,
  GraloniumUtils,
  GroupBuilder,
  HelpCommand,
  InteractionBuilder,
  Interactions,
  Loader,
  ParamsBuilder,
} from "../lib/main.js";

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function createButtonInteraction(customId, userId = "u1") {
  return {
    customId,
    user: { id: userId, username: "User", displayAvatarURL: () => "https://example.com/u.png" },
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
    isMessageContextMenuCommand: () => false,
    isUserContextMenuCommand: () => false,
    isChannelSelectMenu: () => false,
    isMentionableSelectMenu: () => false,
    isRoleSelectMenu: () => false,
    isStringSelectMenu: () => false,
    isUserSelectMenu: () => false,
    reply: vi.fn(async (p) => p),
  };
}

describe("InteractionBuilder routing, Loader, Command/Group flags, and HelpCommand V2", () => {
  it("matches dynamic prefix, global RegExp, and predicate interaction handlers in Loader + Utils", async () => {
    const bot = new Gralonium({ intents: [], prefix: "!", bindProcessHandlers: false });
    const hits = [];

    const exact = {
      data: new InteractionBuilder({ type: Interactions.Button, name: "exact:btn" }),
      code: vi.fn(async (i) => hits.push(`exact:${i.customId}`)),
    };
    const prefixed = {
      data: new InteractionBuilder({ type: Interactions.Button }).setPrefix("ticket:"),
      code: vi.fn(async (i) => hits.push(`prefix:${i.customId}`)),
    };
    const regexed = {
      data: new InteractionBuilder({ type: Interactions.Button, match: /^page:\d+$/g }),
      code: vi.fn(async (i) => hits.push(`regex:${i.customId}`)),
    };

    bot.loader.interactions.button.set(exact.data.name, exact);
    bot.loader.interactionMatchers.set("button", [prefixed, regexed]);

    await GraloniumUtils.Utils.handleInteraction(bot, createButtonInteraction("exact:btn"));
    await GraloniumUtils.Utils.handleInteraction(bot, createButtonInteraction("ticket:close:42"));
    await GraloniumUtils.Utils.handleInteraction(bot, createButtonInteraction("page:1"));
    await GraloniumUtils.Utils.handleInteraction(bot, createButtonInteraction("page:2"));

    expect(hits).toEqual(["exact:exact:btn", "prefix:ticket:close:42", "regex:page:1", "regex:page:2"]);
  });

  it("loads multiple pattern-only interactions from disk without signature collisions and clears on reload", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gralonium-loader-"));
    tempDirs.push(dir);

    const fileA = path.join(dir, "btnA.js");
    const fileB = path.join(dir, "btnB.js");
    const libPath = path.resolve("lib/main.js").replace(/\\/g, "/");

    fs.writeFileSync(
      fileA,
      `const { InteractionBuilder, Interactions } = require("${libPath}");\nexports.data = { data: new InteractionBuilder({ type: Interactions.Button }).setPrefix("a:"), code: async () => {} };\n`
    );
    fs.writeFileSync(
      fileB,
      `const { InteractionBuilder, Interactions } = require("${libPath}");\nexports.data = { data: new InteractionBuilder({ type: Interactions.Button }).setPrefix("b:"), code: async () => {} };\n`
    );

    const bot = new Gralonium({ intents: [], prefix: "!", bindProcessHandlers: false });
    await bot.loader.load(dir);

    expect(bot.loader.interactionMatchers.get("button")).toHaveLength(2);
    expect(bot.loader.resolvePatternInteraction("button", "a:1")).not.toBeNull();
    expect(bot.loader.resolvePatternInteraction("button", "b:2")).not.toBeNull();

    // Reload clears and repopulates cleanly without duplicate errors
    await bot.loader.load(dir, true);
    expect(bot.loader.interactionMatchers.get("button")).toHaveLength(2);
  });

  it("serializes integration_types and contexts in CommandBuilder and GroupBuilder", () => {
    const cmd = new CommandBuilder({
      name: "avatar",
      description: "Shows avatar",
      integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel],
    });
    const cmdJson = cmd.toJSON();
    expect(cmdJson.integration_types).toEqual([0, 1]);
    expect(cmdJson.contexts).toEqual([0, 1, 2]);

    const plainCmd = new CommandBuilder({ name: "ping", description: "Ping" }).toJSON();
    expect("integration_types" in plainCmd).toBe(false);
    expect("contexts" in plainCmd).toBe(false);

    const group = new GroupBuilder({ name: "mod", description: "Moderation" })
      .setIntegrationTypes(0)
      .setContexts(0);
    expect(group.toJSON().integration_types).toEqual([0]);
    expect(group.toJSON().contexts).toEqual([0]);
  });

  it("preserves HelpCommand embed mode by default and renders V2 cards when useV2 is enabled", async () => {
    const bot = new Gralonium({
      intents: [],
      prefix: "!",
      bindProcessHandlers: false,
      helpCommand: HelpCommand,
      helpCommandOptions: {
        useV2: true,
        color: "#e74c3c",
        labels: {
          welcomeTitle: "Ayuda",
          welcomeDescription: "Comandos disponibles",
          notFound: "No se encontró ese comando.",
          usage: "Uso",
          arguments: "Argumentos",
        },
      },
    });

    bot.loader = new Loader({ client: bot });
    const pingCmd = {
      data: new CommandBuilder({ name: "ping", aliases: ["p"], description: "Check latency" }),
      params: null,
      code: async () => {},
    };
    const normalMap = new Map([["ping", pingCmd]]);
    bot.loader.commands.normal = Object.assign(normalMap, {
      map(fn) {
        return Array.from(this.values()).map(fn);
      },
    });

    const classicHelp = new HelpCommand();
    const sentClassic = [];
    const classicCtx = {
      bot,
      prefix: "!",
      author: { username: "Bob", displayAvatarURL: () => "https://example.com/bob.png" },
      get: () => null,
      send: vi.fn(async (p) => sentClassic.push(p)),
    };
    await classicHelp.code(classicCtx);
    expect(sentClassic[0].embeds).toHaveLength(1);

    const v2Help = new HelpCommand(bot.ops.helpCommandOptions);
    const sentV2 = [];
    const v2Ctx = {
      bot,
      prefix: "!",
      author: { username: "Bob", displayAvatarURL: () => "https://example.com/bob.png" },
      get: (k) => (k === "query" ? "ping" : null),
      send: vi.fn(async (builder, opts) => {
        const p = builder.toPayload(opts);
        sentV2.push(p);
        return p;
      }),
    };
    await v2Help.code(v2Ctx);
    expect(sentV2[0].flags & MessageFlags.IsComponentsV2).toBe(MessageFlags.IsComponentsV2);
    expect(JSON.stringify(sentV2[0].components)).toContain("Uso");
    expect(JSON.stringify(sentV2[0].components)).toContain("ping");

    // V2 not found & unpaginated command list (sendEmpty)
    const sentEmpty = [];
    await v2Help.code({
      ...v2Ctx,
      get: () => null,
      send: vi.fn(async (b, o) => {
        const p = b.toPayload(o);
        sentEmpty.push(p);
        return p;
      }),
    });
    expect(JSON.stringify(sentEmpty[0].components)).toContain("!ping");

    const sentMissing = [];
    await v2Help.code({
      ...v2Ctx,
      get: (k) => (k === "query" ? "nonexistent" : null),
      send: vi.fn(async (b, o) => {
        const p = b.toPayload(o);
        sentMissing.push(p);
        return p;
      }),
    });
    expect(JSON.stringify(sentMissing[0].components)).toContain("No se encontró ese comando.");
  });

  it("serializes localizations, ParamsBuilder types/toJSON, InteractionBuilder context menus, and Loader.buildApplicationCommands", async () => {
    const longText = "x".repeat(120);
    const params = new ParamsBuilder()
      .addString({
        name: "query",
        description: longText,
        minLength: 2,
        maxLength: 50,
        nameLocalizations: { "es-ES": "consulta" },
        descriptionLocalizations: { "es-ES": longText },
        choices: [{ name: "All", value: "all", nameLocalizations: { "es-ES": "Todos" } }],
      })
      .addInteger({ name: "count", description: "How many", minValue: 1, maxValue: 10 })
      .addMentionable({ name: "target", description: "User or role" })
      .addUser({ name: "owner", description: "Owner" })
      .addString({ name: "tail", description: "Rest", ellipsis: true });

    const serializedParams = params.toJSON();
    expect(serializedParams).toHaveLength(5);
    expect(serializedParams[0]).toMatchObject({
      type: ApplicationCommandOptionType.String,
      min_length: 2,
      max_length: 50,
      name_localizations: { "es-ES": "consulta" },
    });
    expect(serializedParams[0].description).toHaveLength(100);
    expect(serializedParams[0].description_localizations["es-ES"]).toHaveLength(100);
    expect(serializedParams[0].choices[0]).toEqual({
      name: "All",
      value: "all",
      name_localizations: { "es-ES": "Todos" },
    });
    expect(serializedParams[1]).toMatchObject({
      type: ApplicationCommandOptionType.Integer,
      min_value: 1,
      max_value: 10,
    });
    expect(serializedParams[2].type).toBe(ApplicationCommandOptionType.Mentionable);
    expect(serializedParams[3].type).toBe(ApplicationCommandOptionType.User);
    expect("ellipsis" in serializedParams[4]).toBe(false);
    expect("minLength" in serializedParams[0]).toBe(false);

    const cmd = new CommandBuilder({ name: "search", description: "Search" })
      .setNameLocalizations({ "es-ES": "buscar" })
      .setDescriptionLocalizations({ "es-ES": longText });
    expect(cmd.toJSON().name_localizations).toEqual({ "es-ES": "buscar" });
    expect(cmd.toJSON().description_localizations["es-ES"]).toHaveLength(100);

    const group = new GroupBuilder({ name: "tools", description: "Tools" })
      .setNameLocalizations({ "es-ES": "herramientas" })
      .setDescriptionLocalizations({ "es-ES": "Utilidades" });
    expect(group.toJSON().name_localizations).toEqual({ "es-ES": "herramientas" });

    const userMenu = new InteractionBuilder({ type: Interactions.UserContextMenu, name: "Inspect User" })
      .setGuildOnly(true)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
      .setContexts(InteractionContextType.Guild)
      .setNameLocalizations({ "es-ES": "Inspeccionar Usuario" });
    const msgMenuJson = userMenu.toCommandJSON();
    expect(msgMenuJson.type).toBe(ApplicationCommandType.User);
    expect(msgMenuJson.dm_permission).toBe(false);
    expect(msgMenuJson.default_member_permissions).toBe(String(PermissionFlagsBits.ManageMessages));
    expect("description" in msgMenuJson).toBe(false);
    expect("prefix" in msgMenuJson).toBe(false);

    const disabledMenu = new InteractionBuilder({
      type: Interactions.MessageContextMenu,
      name: "Local Only",
      as_command: false,
    });
    expect(disabledMenu.toCommandJSON()).toBeNull();

    const localized = [];
    const bot = new Gralonium({
      intents: [],
      prefix: "!",
      bindProcessHandlers: false,
      localizeCommand(payload) {
        localized.push(payload.name);
        return {
          ...payload,
          description_localizations: { ...(payload.description_localizations || {}), "fr": "FR" },
        };
      },
    });
    bot.loader.commands.normal = new Collection([["search", { data: cmd, params, code: async () => {} }]]);
    bot.loader.commands.group = new Collection();
    bot.loader.interactions.userContextMenu.set("Inspect User", { data: userMenu, code: async () => {} });
    bot.loader.interactions.messageContextMenu.set("Local Only", { data: disabledMenu, code: async () => {} });

    const builtPayload = await bot.loader.buildApplicationCommands();
    expect(builtPayload).toHaveLength(2);
    expect(localized).toEqual(["search", "Inspect User"]);
    expect(builtPayload[0].description_localizations.fr).toBe("FR");
    expect(builtPayload[1].type).toBe(ApplicationCommandType.User);
  });

  it("loads multiple EventBuilder and plain event modules without signature collisions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gralonium-events-"));
    tempDirs.push(dir);
    const libPath = path.resolve("lib/main.js").replace(/\\/g, "/");

    fs.writeFileSync(
      path.join(dir, "readyOne.js"),
      `const { EventBuilder } = require("${libPath}");\nexports.data = { data: new EventBuilder({ name: "clientReady", once: true }), code: async (client) => { client.__hits.push("readyOne"); } };\n`
    );
    fs.writeFileSync(
      path.join(dir, "readyTwo.js"),
      `const { EventBuilder } = require("${libPath}");\nexports.data = { data: new EventBuilder({ name: "clientReady", once: true }), code: async (client) => { client.__hits.push("readyTwo"); } };\n`
    );
    fs.writeFileSync(
      path.join(dir, "plainMsg.js"),
      `exports.data = { name: "messageCreate", once: false, code: async (client, payload) => { client.__hits.push("plain:" + payload); } };\n`
    );

    const bot = new Gralonium({ intents: [], prefix: "!", bindProcessHandlers: false });
    bot.__hits = [];
    await bot.loader.load(dir);

    expect(bot.listenerCount("clientReady")).toBe(2);
    expect(bot.listenerCount("messageCreate")).toBe(1);

    bot.emit("clientReady");
    bot.emit("messageCreate", "hi");
    expect(bot.__hits.sort()).toEqual(["plain:hi", "readyOne", "readyTwo"]);

    await bot.loader.load(dir, true);
    expect(bot.listenerCount("clientReady")).toBe(2);
    expect(bot.listenerCount("messageCreate")).toBe(1);
  });

  it("scopes grouped cooldown keys, sweeps expired entries, and runs Utils.transform + executeCommand hooks", async () => {
    expect(Cooldowns.resolveKey({ data: { name: "info" } }, { data: { name: "user" } })).toBe("user:info");
    expect(Cooldowns.resolveKey({ data: { name: "info" } }, { data: { name: "server" } })).toBe("server:info");
    expect(Cooldowns.resolveKey("ping")).toBe("ping");

    const bot = new Gralonium({ intents: [], prefix: "!", bindProcessHandlers: false });
    for (let i = 0; i < 500; i += 1) {
      bot.cooldowns.track.set(`cmd#User#u${i}`, { startedAt: 1, expiresAt: 10 });
    }
    await bot.cooldowns.setCooldownSource("fresh", "u501", "User", 60_000);
    expect(bot.cooldowns.track.size).toBe(1);

    const roleObj = { id: "999", name: "Mods" };
    const memberObj = { id: "111", user: { id: "111", username: "Alice" } };
    const fakeGuild = {
      id: "g1",
      roles: {
        cache: { get: (id) => (id === "999" ? roleObj : undefined), find: () => undefined },
        fetch: vi.fn(async (id) => (id === "999" ? roleObj : null)),
      },
      members: {
        cache: { get: (id) => (id === "111" ? memberObj : undefined), find: () => undefined },
        fetch: vi.fn(async (id) => (id === "111" ? memberObj : null)),
      },
      channels: { cache: { get: () => undefined, find: () => undefined }, fetch: vi.fn(async () => null) },
    };
    const fakeCtx = {
      bot,
      guild: fakeGuild,
      message: {
        attachments: new Map([
          ["a1", { id: "a1", name: "first.png" }],
          ["a2", { id: "a2", name: "second.png" }],
        ]),
      },
    };

    const intRes = await GraloniumUtils.Utils.transform("7", { name: "n", type: ApplicationCommandOptionType.Integer, minValue: 1, maxValue: 10 }, fakeCtx);
    expect(intRes.value).toBe(7);
    await expect(
      GraloniumUtils.Utils.transform("3.5", { name: "n", type: ApplicationCommandOptionType.Integer }, fakeCtx)
    ).rejects.toThrow();

    const mentionRole = await GraloniumUtils.Utils.transform("<@&999>", { name: "t", type: ApplicationCommandOptionType.Mentionable }, fakeCtx);
    expect(mentionRole.value).toBe(roleObj);
    const mentionUser = await GraloniumUtils.Utils.transform("<@111>", { name: "t", type: ApplicationCommandOptionType.Mentionable }, fakeCtx);
    expect(mentionUser.value).toBe(memberObj);

    const att1 = await GraloniumUtils.Utils.transform("", { name: "f1", type: ApplicationCommandOptionType.Attachment, required: true }, fakeCtx, false, 0);
    const att2 = await GraloniumUtils.Utils.transform("", { name: "f2", type: ApplicationCommandOptionType.Attachment, required: true }, fakeCtx, false, 1);
    expect(att1.value.id).toBe("a1");
    expect(att2.value.id).toBe("a2");

    const order = [];
    const hookBot = new Gralonium({
      intents: [],
      prefix: "!",
      guildOnly: false,
      bindProcessHandlers: false,
      beforeExecute: async (ctx) => {
        order.push(`before:${ctx.get("count")}`);
        return ctx.get("count") !== 0;
      },
      afterExecute: async () => {
        order.push("after");
      },
    });
    const hookedCommand = {
      data: new CommandBuilder({ name: "do", description: "Do", cooldown: { seconds: 10 } }),
      params: new ParamsBuilder().addInteger({ name: "count", description: "Count", required: true }),
      code: vi.fn(async () => order.push("run")),
    };

    const makePrefixCtx = (authorId) =>
      new Context(
        hookBot,
        Object.create(Message.prototype, {
          id: { value: `m_${authorId}`, configurable: true },
          author: { value: { id: authorId }, configurable: true },
          guild: { value: null, configurable: true },
          channel: { value: { type: ChannelType.DM }, configurable: true },
        })
      );

    await GraloniumUtils.Utils.executeCommand(
      makePrefixCtx("u1"),
      hookedCommand,
      { source: "prefix", args: ["0"], prefix: "!" }
    );
    expect(order).toEqual(["before:0"]);

    await GraloniumUtils.Utils.executeCommand(
      makePrefixCtx("u2"),
      hookedCommand,
      { source: "prefix", args: ["5"], prefix: "!" }
    );
    expect(order).toEqual(["before:0", "before:5", "run", "after"]);

    // Verify slash Integer & Mentionable extraction + grouped cooldown isolation
    const mentionObj = { id: "m1" };
    const slashCommandA = {
      data: new CommandBuilder({ name: "info", description: "Info A", cooldown: { seconds: 30 } }),
      params: new ParamsBuilder()
        .addInteger({ name: "n", description: "Number" })
        .addMentionable({ name: "who", description: "Who" }),
      code: vi.fn(async (ctx) => {
        expect(ctx.get("n")).toBe(42);
        expect(ctx.get("who")).toBe(mentionObj);
      }),
    };
    const slashCommandB = {
      data: new CommandBuilder({ name: "info", description: "Info B", cooldown: { seconds: 30 } }),
      params: null,
      code: vi.fn(async () => {}),
    };
    const slashInteraction = {
      user: { id: "u3" },
      guild: { id: "g1" },
      channel: { type: ChannelType.GuildText },
      isChatInputCommand: () => true,
      isAutocomplete: () => false,
      options: {
        getInteger: vi.fn(() => 42),
        getMentionable: vi.fn(() => mentionObj),
      },
    };
    await GraloniumUtils.Utils.executeCommand(
      new Context(hookBot, slashInteraction),
      slashCommandA,
      { group: { data: { name: "user" } }, source: "slash", interaction: slashInteraction }
    );
    await GraloniumUtils.Utils.executeCommand(
      new Context(hookBot, slashInteraction),
      slashCommandB,
      { group: { data: { name: "server" } }, source: "slash", interaction: slashInteraction }
    );
    expect(slashCommandA.code).toHaveBeenCalledTimes(1);
    expect(slashCommandB.code).toHaveBeenCalledTimes(1);
  });
});
