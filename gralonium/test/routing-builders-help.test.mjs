import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ApplicationIntegrationType, InteractionContextType, MessageFlags } from "discord.js";
import {
  CommandBuilder,
  Gralonium,
  GraloniumUtils,
  GroupBuilder,
  HelpCommand,
  InteractionBuilder,
  Interactions,
  Loader,
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
});
