import { describe, it, expect, vi } from "vitest";
import { Message, MessageFlags } from "discord.js";
import { ComponentsV2Builder, Context } from "../lib/main.js";

function createFakeBot(extraOps = {}) {
  return {
    ops: {
      retryOnRateLimit: false,
      ...extraOps,
    },
    user: { id: "bot_1", username: "TestBot", displayAvatarURL: () => "https://example.com/bot.png" },
  };
}

function createFakeMessage(overrides = {}) {
  const sentMessages = [];
  const channel = {
    sendTyping: vi.fn(async () => undefined),
    send: vi.fn(async (payload) => {
      const msg = {
        id: `sent_${sentMessages.length + 1}`,
        payload,
        edit: vi.fn(async (next) => ({ id: msg.id, edited: next })),
        delete: vi.fn(async () => undefined),
      };
      sentMessages.push(msg);
      return msg;
    }),
  };

  const props = {
    id: { value: "msg_1", configurable: true, writable: true },
    author: { value: { id: "user_1", username: "Alice", displayAvatarURL: () => "https://example.com/u.png" }, configurable: true },
    member: { value: null, configurable: true },
    guild: { value: null, configurable: true },
    channel: { value: channel, configurable: true },
    reply: { value: vi.fn(async (payload) => ({ id: "reply_1", payload })), configurable: true },
  };
  for (const [k, v] of Object.entries(overrides)) {
    props[k] = { value: v, configurable: true, writable: true };
  }
  const msg = Object.create(Message.prototype, props);

  return { msg, channel };
}

function createFakeInteraction(overrides = {}) {
  return {
    user: { id: "user_1", username: "Alice", displayAvatarURL: () => "https://example.com/u.png" },
    member: null,
    guild: null,
    channel: { id: "ch_1" },
    deferred: false,
    replied: false,
    ephemeral: false,
    isChatInputCommand: () => true,
    isAutocomplete: () => false,
    deferReply: vi.fn(async function (opts = {}) {
      this.deferred = true;
      this.ephemeral = Boolean(opts.flags && (opts.flags & MessageFlags.Ephemeral));
      return { deferred: true };
    }),
    reply: vi.fn(async function (payload) {
      this.replied = true;
      return payload;
    }),
    editReply: vi.fn(async (payload) => payload),
    followUp: vi.fn(async (payload) => payload),
    deleteReply: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("Context", () => {
  it("exposes ctx.user, isPrefix, isSlash, and isInteraction accurately", () => {
    const bot = createFakeBot();
    const { msg } = createFakeMessage();
    const prefixCtx = new Context(bot, msg);
    expect(prefixCtx.user).toBe(prefixCtx.author);
    expect(prefixCtx.isPrefix).toBe(true);
    expect(prefixCtx.isInteraction).toBe(false);
    expect(prefixCtx.isSlash).toBe(false);

    const interaction = createFakeInteraction();
    const slashCtx = new Context(bot, interaction);
    expect(slashCtx.user).toBe(slashCtx.author);
    expect(slashCtx.isPrefix).toBe(false);
    expect(slashCtx.isInteraction).toBe(true);
    expect(slashCtx.isSlash).toBe(true);
  });

  it("strips MessageFlags.Ephemeral on prefix Message sends and validates V2 incompatibilities", async () => {
    const bot = createFakeBot();
    const { msg, channel } = createFakeMessage();
    const ctx = new Context(bot, msg);

    const v2 = new ComponentsV2Builder().addText("Visible in prefix");
    await ctx.ephemeral(v2);

    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0][0];
    expect(payload.flags & MessageFlags.IsComponentsV2).toBe(MessageFlags.IsComponentsV2);
    expect(payload.flags & MessageFlags.Ephemeral).toBe(0);

    await expect(
      ctx.send({
        flags: MessageFlags.IsComponentsV2,
        content: "Illegal with V2",
        components: v2.build(),
      })
    ).rejects.toThrow(/IsComponentsV2/i);

    await expect(
      ctx.send({
        flags: MessageFlags.IsComponentsV2,
        embeds: [{}],
        components: v2.build(),
      })
    ).rejects.toThrow(/IsComponentsV2/i);
  });

  it("supports replyOnPrefix and ctx.reply() on prefix messages", async () => {
    const bot = createFakeBot({ replyOnPrefix: true });
    const { msg } = createFakeMessage();
    const ctx = new Context(bot, msg);

    await ctx.send("Pong");
    expect(msg.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Pong",
        allowedMentions: { parse: [], repliedUser: false },
      })
    );
  });

  it("handles prefix defer({ thinking: true }) placeholder edits and V2->V1 replacements", async () => {
    const bot = createFakeBot();
    const { msg, channel } = createFakeMessage();
    const ctx = new Context(bot, msg);

    const thinkingMsg = await ctx.defer({ thinking: true, thinkingText: "Working..." });
    expect(channel.send).toHaveBeenCalledTimes(1);

    const v2 = new ComponentsV2Builder().addText("Done!");
    await ctx.send(v2);
    expect(thinkingMsg.edit).toHaveBeenCalledTimes(1);

    const thinkingMsg2 = await ctx.defer({ thinking: true });
    await ctx.send("Plain V1 message");
    expect(thinkingMsg2.delete).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledTimes(3);
  });

  it("switches public defer to deleteReply() + followUp() when ephemeral reply is sent", async () => {
    const bot = createFakeBot();
    const interaction = createFakeInteraction();
    const ctx = new Context(bot, interaction);

    await ctx.defer({ ephemeral: false });
    expect(interaction.deferred).toBe(true);
    expect(interaction.ephemeral).toBe(false);

    const v2 = new ComponentsV2Builder().addText("Secret error");
    await ctx.ephemeral(v2);

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).not.toHaveBeenCalled();
    const sent = interaction.followUp.mock.calls[0][0];
    expect(sent.flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    expect(sent.flags & MessageFlags.IsComponentsV2).toBe(MessageFlags.IsComponentsV2);
  });
});
