import { describe, it, expect } from "vitest";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  SeparatorSpacingSize,
} from "discord.js";
import { ComponentsV2Builder } from "../lib/main.js";

describe("ComponentsV2Builder", () => {
  it("preserves 0.3.0 backwards-compatible API", () => {
    const built = new ComponentsV2Builder()
      .addText("Hello")
      .addSeparator("large")
      .addButton("OK", "ok_btn", "success")
      .addButtons([
        ["One", "btn_1"],
        ["Two", "btn_2", "danger"],
      ])
      .addSelectMenu("role_sel", "Choose roles")
      .addOption("Admin", "admin", "Full access", "🛡️")
      .end()
      .setSpoiler(true)
      .build();

    expect(built).toHaveLength(1);
    expect(built[0]).toBeInstanceOf(ContainerBuilder);
    const json = built[0].toJSON();
    expect(json.spoiler).toBe(true);
    expect(json.components).toHaveLength(5);
    expect(json.components[0].content).toBe("Hello");
    expect(json.components[1].spacing).toBe(SeparatorSpacingSize.Large);
    expect(json.components[4].components[0].options[0].emoji).toEqual({ name: "🛡️" });

    expect(new ComponentsV2Builder().build()).toHaveLength(1);
    expect(() => new ComponentsV2Builder().addText("")).toThrow();
    expect(() => new ComponentsV2Builder().addText("", { ignoreEmpty: true })).not.toThrow();
  });

  it("supports colors, sections with thumbnail/button fallback, galleries, spacers, and files", () => {
    const buf = Buffer.from("transcript data");
    const builder = new ComponentsV2Builder({ color: "#e74c3c" })
      .addSection(["### Bot", "> Ready"], {
        thumbnail: "https://cdn.example.com/icon.png",
        thumbnailDescription: "Avatar",
      })
      .addSection(["### No Thumb"], { thumbnail: "invalid-url", fallbackToText: true })
      .addSection(["### With Button"], { button: { label: "Inspect", customId: "inspect", style: "secondary" } })
      .addSpacer("small")
      .addGallery("attachment://preview.png")
      .addAttachment(buf, { name: "preview.png" })
      .addFile(Buffer.from("full log"), { name: "full log.txt", spoiler: true });

    const payload = builder.toPayload({ ephemeral: true, suppressNotifications: true });
    expect(payload.flags & MessageFlags.IsComponentsV2).toBe(MessageFlags.IsComponentsV2);
    expect(payload.flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    expect(payload.flags & MessageFlags.SuppressNotifications).toBe(MessageFlags.SuppressNotifications);
    expect(payload.allowedMentions).toEqual({ parse: [], repliedUser: false });
    expect(payload.files).toHaveLength(2);
    expect(payload.files[0]).toBeInstanceOf(AttachmentBuilder);
    expect(payload.files[1].name).toBe("full_log.txt");

    const json = builder.toJSON()[0];
    expect(json.accent_color).toBe(0xe74c3c);
    expect(json.components[0].type).toBe(ComponentType.Section);
    expect(json.components[0].accessory.type).toBe(ComponentType.Thumbnail);
    expect(json.components[1].type).toBe(ComponentType.TextDisplay);
    expect(json.components[2].type).toBe(ComponentType.Section);
    expect(json.components[2].accessory.type).toBe(ComponentType.Button);
    expect(json.components[3].divider).toBe(false);
    expect(json.components[4].type).toBe(ComponentType.MediaGallery);
    expect(json.components[5].type).toBe(ComponentType.File);
    expect(json.components[5].file.url).toBe("attachment://full_log.txt");
    expect(json.components[5].spoiler).toBe(true);

    expect(() => new ComponentsV2Builder().addSection("Text", { thumbnail: null, fallbackToText: false })).toThrow();
  });

  it("supports buttons, custom emojis, all select types, outside() rows, and multiple containers", () => {
    const builder = new ComponentsV2Builder({ color: "primary" })
      .addText("Container 1")
      .addButton({ label: "Invite", url: "https://discord.com", emoji: "<:redbot:1474109778044260478>" })
      .addButton({ customId: "emoji_only", emoji: "<a:wave:12345678901234567>", style: "secondary", disabled: true })
      .addSelectRow({
        type: "channel",
        customId: "ch",
        channelTypes: [ChannelType.GuildText],
        minValues: 1,
        maxValues: 2,
      })
      .addUserSelectMenu("usr", { defaultUsers: ["111"], disabled: true })
      .addRoleSelectMenu("rol")
      .addMentionableSelectMenu("mnt", { defaultRoles: ["222"], defaultUsers: ["333"] })
      .outside()
      .addButtonsRow([
        { label: "Delete", customId: "del", style: "danger" },
        false,
        null,
      ])
      .addContainer({ color: "success" })
      .addText("Container 2");

    const first = builder.toJSON();
    const second = builder.toJSON();
    expect(first).toEqual(second);

    expect(first).toHaveLength(3);
    expect(first[0].type).toBe(ComponentType.Container);
    expect(first[0].accent_color).toBe(0x5865f2);
    expect(first[1].type).toBe(ComponentType.ActionRow);
    expect(first[1].components[0].custom_id).toBe("del");
    expect(first[2].type).toBe(ComponentType.Container);
    expect(first[2].accent_color).toBe(0x57f287);

    const rowBtns = first[0].components[1].components;
    expect(rowBtns[0].style).toBe(ButtonStyle.Link);
    expect(rowBtns[0].emoji).toEqual({ animated: false, name: "redbot", id: "1474109778044260478" });
    expect(rowBtns[1].disabled).toBe(true);
    expect(rowBtns[1].emoji).toEqual({ animated: true, name: "wave", id: "12345678901234567" });

    expect(first[0].components[2].components[0].type).toBe(ComponentType.ChannelSelect);
    expect(first[0].components[3].components[0].type).toBe(ComponentType.UserSelect);
    expect(first[0].components[3].components[0].disabled).toBe(true);
    expect(first[0].components[4].components[0].type).toBe(ComponentType.RoleSelect);
    expect(first[0].components[5].components[0].type).toBe(ComponentType.MentionableSelect);

    const outsideOnly = new ComponentsV2Builder({ color: "red" }).outside().addButton({ label: "Solo", customId: "s" }).build();
    expect(outsideOnly).toHaveLength(1);
    expect(outsideOnly[0]).toBeInstanceOf(ActionRowBuilder);
  });

  it("handles addSmartText overflow modes (file, clip, split) and tracks V2 budgets", () => {
    const longText = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}: some repeated text payload content.`).join("\n");

    const fileBuilder = new ComponentsV2Builder().addSmartText(longText, {
      overflow: "file",
      filename: "transcript.txt",
      maxLength: 500,
    });
    expect(fileBuilder.files).toHaveLength(1);
    expect(fileBuilder.files[0].name).toBe("transcript.txt");
    expect(fileBuilder.textLength).toBeLessThanOrEqual(500);
    expect(fileBuilder.remainingChars).toBe(4000 - fileBuilder.textLength);

    const clipBuilder = new ComponentsV2Builder().addSmartText(longText, {
      overflow: "clip",
      maxLength: 200,
    });
    expect(clipBuilder.files).toHaveLength(0);
    expect(clipBuilder.textLength).toBe(200);
    expect(clipBuilder.componentCount).toBe(2);

    const splitBuilder = new ComponentsV2Builder().addSmartText(longText, {
      overflow: "split",
      chunkSize: 1200,
      filename: "remainder.txt",
    });
    expect(splitBuilder.textLength).toBeLessThanOrEqual(4000);
    expect(splitBuilder.files).toHaveLength(1);
  });

  it("prevents duplicate separators in addSectionBlock and supports agnostic templates", () => {
    const b = new ComponentsV2Builder()
      .addText("Header")
      .addSeparator("small")
      .addSectionBlock("Block A", [["Key", "Val"]])
      .addSectionBlock("Block B", [["Key2", "Val2"]]);

    const comps = b.toJSON()[0].components;
    expect(comps.map((c) => c.type)).toEqual([
      ComponentType.TextDisplay,
      ComponentType.Separator,
      ComponentType.TextDisplay,
      ComponentType.Separator,
      ComponentType.TextDisplay,
    ]);

    const card = ComponentsV2Builder.card({
      title: "Server Info",
      color: "primary",
      fields: [["Members", "42"], false],
      footer: "ID: 123",
    });
    expect(card.toJSON()[0].accent_color).toBe(0x5865f2);

    const imgView = ComponentsV2Builder.imageView({
      title: "Banner",
      image: "https://example.com/banner.png",
      links: [{ label: "Open", url: "https://example.com/banner.png" }],
    });
    expect(imgView.toJSON()[0].components.some((c) => c.type === ComponentType.MediaGallery)).toBe(true);

    const list = ComponentsV2Builder.list({
      title: "Warnings",
      items: ["Spam", "Caps"],
      numbered: true,
      page: 1,
      totalPages: 3,
      totalItems: 6,
    });
    const listStr = JSON.stringify(list.toJSON());
    expect(listStr).toContain("**1.** Spam");
    expect(listStr).toContain("Página 1/3");

    const confirmLegacy = ComponentsV2Builder.createConfirm("yes_id", "no_id", "Sure?", "Really delete?");
    expect(JSON.stringify(confirmLegacy.toJSON())).toContain("yes_id");

    const confirmObj = ComponentsV2Builder.confirm({
      title: "Confirm Purge",
      message: "Delete 50 messages?",
      confirmId: "c1",
      cancelId: "c2",
      warning: "Irreversible",
    });
    expect(JSON.stringify(confirmObj.toJSON())).toContain("> Irreversible");
  });
});
