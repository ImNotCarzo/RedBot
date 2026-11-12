import { createRequire } from "module";
import { describe, it, expect, vi } from "vitest";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { V2Text } from "../lib/main.js";

const require = createRequire(import.meta.url);
const helpers = require("../lib/classes/builders/components/helpers.js");

describe("components helpers", () => {
  it("resolves hex, 3-char hex, RGB tuple, integer, and preset accent colors", () => {
    expect(helpers.resolveAccentColor("#e74c3c")).toBe(0xe74c3c);
    expect(helpers.resolveAccentColor("0x5865f2")).toBe(0x5865f2);
    expect(helpers.resolveAccentColor("#f0a")).toBe(0xff00aa);
    expect(helpers.resolveAccentColor([255, 0, 128])).toBe(0xff0080);
    expect(helpers.resolveAccentColor(0x57f287)).toBe(0x57f287);
    expect(helpers.resolveAccentColor("danger")).toBe(0xed4245);
    expect(helpers.resolveAccentColor("Blurple")).toBeTypeOf("number");
    expect(helpers.resolveAccentColor(null)).toBeNull();
    expect(helpers.resolveAccentColor("invalid", "#112233")).toBe(0x112233);
    expect(() => helpers.resolveAccentColor(0x1000000)).toThrow(RangeError);
    expect(() => helpers.resolveAccentColor("not-a-color")).toThrow(TypeError);
  });

  it("parses unicode emojis, custom Discord markup, colons, snowflakes, and objects", () => {
    expect(helpers.parseEmoji("🔧")).toEqual({ name: "🔧" });
    expect(helpers.parseEmoji("<:redbot:1474109778044260478>")).toEqual({
      animated: false,
      name: "redbot",
      id: "1474109778044260478",
    });
    expect(helpers.parseEmoji("<a:spin:12345678901234567>")).toEqual({
      animated: true,
      name: "spin",
      id: "12345678901234567",
    });
    expect(helpers.parseEmoji("check:987654321098765432")).toEqual({
      animated: false,
      name: "check",
      id: "987654321098765432",
    });
    expect(helpers.parseEmoji("987654321098765432")).toEqual({ id: "987654321098765432" });
    expect(helpers.parseEmoji({ id: "123", name: "x", animated: true })).toEqual({
      id: "123",
      name: "x",
      animated: true,
    });
    expect(helpers.parseEmoji("")).toBeNull();
  });

  it("validates media and link URLs safely", () => {
    expect(helpers.isValidMediaUrl("https://cdn.example.com/img.png")).toBe(true);
    expect(helpers.isValidMediaUrl("http://example.com/a.jpg")).toBe(true);
    expect(helpers.isValidMediaUrl("attachment://output.txt")).toBe(true);
    expect(helpers.isValidMediaUrl("attachment://sub/dir.txt")).toBe(false);
    expect(helpers.isValidMediaUrl("ftp://example.com/a.png")).toBe(false);
    expect(helpers.isValidMediaUrl("not a url")).toBe(false);
    expect(helpers.isValidMediaUrl(null)).toBe(false);

    expect(helpers.isValidLinkUrl("https://discord.com")).toBe(true);
    expect(helpers.isValidLinkUrl("discord://-/channels/1/2")).toBe(true);
    expect(helpers.isValidLinkUrl("attachment://file.txt")).toBe(false);
    expect(helpers.isValidLinkUrl("javascript:alert(1)")).toBe(false);
  });

  it("recursively disables interactive components across V1 rows and V2 containers/sections", async () => {
    const container = new ContainerBuilder()
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent("Row"))
          .setButtonAccessory(new ButtonBuilder().setCustomId("sec_btn").setLabel("Go").setStyle(ButtonStyle.Primary))
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("btn_1").setLabel("Click").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setURL("https://example.com").setLabel("Link").setStyle(ButtonStyle.Link)
        )
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("sel_1")
            .setPlaceholder("Pick")
            .addOptions({ label: "A", value: "a" })
        )
      );

    const disabledDefault = helpers.disableComponents([container]);
    expect(disabledDefault[0].type).toBe(ComponentType.Container);
    expect(disabledDefault[0].components[0].accessory.disabled).toBe(true);
    expect(disabledDefault[0].components[1].components[0].disabled).toBe(true);
    expect(disabledDefault[0].components[1].components[1].disabled).toBeUndefined();
    expect(disabledDefault[0].components[2].components[0].disabled).toBe(true);

    const disabledAll = helpers.disableComponents([container], { disableLinks: true });
    expect(disabledAll[0].components[1].components[1].disabled).toBe(true);

    const editMock = vi.fn(async (p) => p);
    const fakeMsg = {
      editable: true,
      components: [container],
      flags: { has: (f) => f === MessageFlags.IsComponentsV2 },
      edit: editMock,
    };
    await helpers.disableMessageComponents(fakeMsg);
    expect(editMock).toHaveBeenCalledTimes(1);
    const arg = editMock.mock.calls[0][0];
    expect(arg.flags).toBe(MessageFlags.IsComponentsV2);
    expect(arg.components[0].components[0].accessory.disabled).toBe(true);
  });
});

describe("V2Text formatting helpers", () => {
  it("formats headings, code, subtext, clipped text, quotes, and filtered fields", () => {
    expect(V2Text.heading("Title", 3)).toBe("### Title");
    expect(V2Text.code("v1.0")).toBe("`v1.0`");
    expect(V2Text.subtext("Footer")).toBe("-# Footer");
    expect(V2Text.clip("abcdefghij", 5)).toBe("abcd…");

    const fields = V2Text.fields([
      ["Users", "`120`"],
      false,
      null,
      ["Empty", ""],
      { label: "Status", value: "Online" },
    ]);
    expect(fields).toBe("> **Users:** `120`\n> **Status:** Online");

    const withFallback = V2Text.fields([["Empty", null]], { omitEmpty: false, fallback: "N/A" });
    expect(withFallback).toBe("> **Empty:** N/A");

    expect(V2Text.sectionBlock("Empty Section", [["Key", undefined]])).toBe("");
    expect(V2Text.sectionBlock("Stats", [["Ping", "15ms"]])).toBe("**Stats**\n> **Ping:** 15ms");
    expect(V2Text.quote("Line 1\nLine 2")).toBe("> Line 1\n> Line 2");
  });
});
