import { EventEmitter } from "events";
import { describe, it, expect, vi } from "vitest";
import { ButtonStyle, MessageFlags } from "discord.js";
import { ComponentsV2Builder, V2Paginator, V2View } from "../lib/main.js";
import { Confirmator, Paginator } from "../lib/experiments.js";

function createMockCollectorMessage(initialComponents = []) {
  const collectors = [];
  const message = {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    editable: true,
    components: initialComponents,
    edit: vi.fn(async (payload) => {
      if (payload.components) message.components = payload.components;
      return message;
    }),
    delete: vi.fn(async () => undefined),
    createMessageComponentCollector: vi.fn(() => {
      const ee = new EventEmitter();
      ee.ended = false;
      ee.stop = vi.fn((reason = "user") => {
        if (ee.ended) return;
        ee.ended = true;
        ee.emit("end", new Map(), reason);
      });
      collectors.push(ee);
      return ee;
    }),
  };
  return { message, collectors };
}

function createComponentInteraction(customId, userId = "owner_1", extra = {}) {
  const ephemeralMsg = createMockCollectorMessage();
  return {
    customId,
    user: { id: userId },
    replied: false,
    deferred: false,
    values: extra.values || [],
    deferUpdate: vi.fn(async function () {
      this.deferred = true;
    }),
    update: vi.fn(async function (payload) {
      this.replied = true;
      return payload;
    }),
    reply: vi.fn(async function (payload) {
      this.replied = true;
      if (payload.withResponse) {
        return { resource: { message: ephemeralMsg.message } };
      }
      return ephemeralMsg.message;
    }),
    ...extra,
    _ephemeralTarget: ephemeralMsg,
  };
}

describe("Paginator & Confirmator upgrades", () => {
  it("fixes nextButton style bug and supports V2 recursive disabling on end", async () => {
    const row = Paginator.Buttons({
      previous: { label: "Prev", style: "secondary", emoji: "⬅️" },
      next: { label: "Next", style: "danger", emoji: "<:arrow:123456789012345678>" },
    });
    expect(row.components[0].style).toBe(ButtonStyle.Secondary);
    expect(row.components[1].style).toBe(ButtonStyle.Danger);
    expect(row.components[1].emoji).toEqual({ animated: false, name: "arrow", id: "123456789012345678" });

    const page1 = new ComponentsV2Builder().addText("Page 1").addButtonsRow([
      { label: "Prev", customId: "previousButton" },
      { label: "Next", customId: "continueButton" },
    ]);
    const page2 = new ComponentsV2Builder().addText("Page 2").addButtonsRow([
      { label: "Prev", customId: "previousButton" },
      { label: "Next", customId: "continueButton" },
    ]);

    const { message, collectors } = createMockCollectorMessage(page1.build());
    const paginator = new Paginator({}, { pages: [page1, page2], author: { id: "owner_1" }, timeout: 30 }).setMessage(message);
    paginator.start();

    const nextClick = createComponentInteraction("continueButton", "owner_1");
    collectors[0].emit("collect", nextClick);
    await new Promise((r) => setTimeout(r, 0));

    expect(paginator.pageNumber).toBe(2);
    expect(message.edit).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.IsComponentsV2 }));

    collectors[0].stop("time");
    await new Promise((r) => setTimeout(r, 0));

    const lastEdit = message.edit.mock.calls.at(-1)[0];
    expect(lastEdit.flags).toBe(MessageFlags.IsComponentsV2);
    expect(lastEdit.components[0].components[1].components[0].disabled).toBe(true);
    expect(lastEdit.components[0].components[1].components[1].disabled).toBe(true);
  });

  it("disables nested Confirmator V2 buttons cleanly upon confirmation", async () => {
    const v2Confirm = new ComponentsV2Builder().addSection("Confirm?", {
      button: { label: "Go", customId: "continueButton", style: "danger" },
    });
    const { message, collectors } = createMockCollectorMessage(v2Confirm.build());
    const onConfirm = vi.fn();

    const conf = new Confirmator({}, { author: { id: "owner_1" } }).setContinueProcess(onConfirm).setMessage(message);
    conf.start();

    collectors[0].emit("collect", createComponentInteraction("continueButton", "owner_1"));
    await new Promise((r) => setTimeout(r, 0));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const lastEdit = message.edit.mock.calls.at(-1)[0];
    expect(lastEdit.components[0].components[0].accessory.disabled).toBe(true);
  });
});

describe("V2View & V2Paginator", () => {
  it("routes scoped IDs, updates owner state, and spawns interactive ephemeral-view for third parties", async () => {
    const view = new V2View({
      authorId: "owner_1",
      state: { count: 0 },
      thirdPartyMode: "ephemeral-view",
      onEnd: "disable",
      render: ({ state, id }) =>
        new ComponentsV2Builder()
          .addText(`Count: ${state.count}`)
          .addButton({ label: "+1", customId: id("inc") }),
      actions: {
        inc: ({ state, setState }) => {
          setState({ count: state.count + 1 });
        },
      },
    });

    const { message, collectors } = createMockCollectorMessage(view.toPayload().components);
    const fakeCtx = { send: vi.fn(async () => message) };
    await view.send(fakeCtx);

    const ownerClick = createComponentInteraction(view.id("inc"), "owner_1");
    collectors[0].emit("collect", ownerClick);
    await new Promise((r) => setTimeout(r, 0));
    expect(ownerClick.update).toHaveBeenCalledTimes(1);
    expect(view.state.count).toBe(1);

    const otherClick = createComponentInteraction(view.id("inc"), "guest_2");
    collectors[0].emit("collect", otherClick);
    await new Promise((r) => setTimeout(r, 0));

    expect(view.state.count).toBe(1);
    expect(otherClick.reply).toHaveBeenCalledTimes(1);
    const ephPayload = otherClick.reply.mock.calls[0][0];
    expect(ephPayload.flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    expect(JSON.stringify(ephPayload.components)).toContain("Count: 2");

    expect(otherClick._ephemeralTarget.collectors).toHaveLength(1);
    const subButtonId = ephPayload.components[0].toJSON().components[1].components[0].custom_id;
    const subClick = createComponentInteraction(subButtonId, "guest_2");
    otherClick._ephemeralTarget.collectors[0].emit("collect", subClick);
    await new Promise((r) => setTimeout(r, 0));
    expect(subClick.update).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(subClick.update.mock.calls[0][0].components)).toContain("Count: 3");
  });

  it("paginates items with wrap=false, close button, and non-mutating prebuilt pages", async () => {
    const pager = new V2Paginator({
      items: ["One", "Two", "Three", "Four", "Five"],
      perPage: 2,
      wrap: false,
      authorId: "owner_1",
      closeButton: true,
      title: "Results",
    });

    const p1 = pager.toPayload();
    expect(pager.totalPages).toBe(3);
    const p1Str = JSON.stringify(p1.components);
    expect(p1Str).toContain("One");
    expect(p1Str).toContain("Página 1/3");

    const { message, collectors } = createMockCollectorMessage(p1.components);
    pager.attach(message);

    const nextId = pager.view.id("next");
    const closeId = pager.view.id("close");

    collectors[0].emit("collect", createComponentInteraction(nextId, "owner_1"));
    await new Promise((r) => setTimeout(r, 0));
    expect(pager.pageIndex).toBe(1);

    collectors[0].emit("collect", createComponentInteraction(closeId, "owner_1"));
    await new Promise((r) => setTimeout(r, 0));
    expect(pager.view.isEnded).toBe(true);
    expect(message.edit).toHaveBeenCalled();

    const prebuiltA = new ComponentsV2Builder().addText("Alpha");
    const prebuiltB = new ComponentsV2Builder().addText("Beta");
    const customPager = new V2Paginator({ pages: [prebuiltA, prebuiltB] });
    customPager.toPayload();
    customPager.toPayload();
    expect(prebuiltA.componentCount).toBe(2);
  });

  it("handles V2View thirdPartyMode=reject, onEnd=static, and onEnd=delete", async () => {
    const rejectView = new V2View({
      authorId: "owner_1",
      thirdPartyMode: "reject",
      thirdPartyMessage: "Denied!",
      onEnd: "delete",
      render: ({ id }) => new ComponentsV2Builder().addText("Open").addButton({ label: "Close", customId: id("close") }),
      actions: { close: ({ stop }) => stop("closed") },
    });
    const { message: msg1, collectors: col1 } = createMockCollectorMessage(rejectView.toPayload().components);
    rejectView.attach(msg1);

    const outsider = createComponentInteraction(rejectView.id("close"), "stranger");
    col1[0].emit("collect", outsider);
    await new Promise((r) => setTimeout(r, 0));
    expect(outsider.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Denied!", flags: MessageFlags.Ephemeral })
    );

    const ownerClose = createComponentInteraction(rejectView.id("close"), "owner_1");
    col1[0].emit("collect", ownerClose);
    await new Promise((r) => setTimeout(r, 0));
    expect(msg1.delete).toHaveBeenCalledTimes(1);

    const staticView = new V2View({
      onEnd: "static",
      render: ({ id }) => new ComponentsV2Builder().addText("Active").addButton({ label: "Act", customId: id("act") }),
      renderStatic: () => new ComponentsV2Builder().addText("Ended cleanly"),
    });
    const { message: msg2, collectors: col2 } = createMockCollectorMessage(staticView.toPayload().components);
    staticView.attach(msg2);
    col2[0].stop("timeout");
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.stringify(msg2.edit.mock.calls[0][0].components)).toContain("Ended cleanly");
  });
});
