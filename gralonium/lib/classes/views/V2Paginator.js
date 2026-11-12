"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.V2Paginator = void 0;

const { ComponentsV2Builder } = require("../builders/ComponentsV2Builder.js");
const { V2View } = require("./V2View.js");

function chunkItems(items, perPage) {
  const size = Math.max(1, Number(perPage) || 10);
  if (!Array.isArray(items) || items.length === 0) {
    return [[]];
  }
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Interactive Components V2 paginator built atop `V2View`.
 * Accepts either explicit `pages` or `items` + `perPage` (auto-sliced),
 * with customizable page rendering, wrap navigation, optional close button,
 * and automatic ephemeral third-party cloning when `thirdPartyMode: "ephemeral-view"`.
 */
class V2Paginator {
  #pages;
  #perPage;
  #totalItems;
  #wrap;
  #view;
  #options;

  constructor(options = {}) {
    this.#options = options;
    this.#perPage = Math.max(1, Number(options.perPage) || 10);
    this.#wrap = options.wrap !== false;

    if (Array.isArray(options.pages) && options.pages.length > 0) {
      this.#pages = options.pages;
      this.#totalItems = options.totalItems ?? options.pages.length;
    } else {
      const items = Array.isArray(options.items) ? options.items : [];
      this.#totalItems = items.length;
      this.#pages = chunkItems(items, this.#perPage);
    }

    const totalPages = this.#pages.length;
    const initialPage = Math.min(Math.max(0, Number(options.initialPage) || 0), totalPages - 1);

    this.#view = new V2View({
      idPrefix: options.idPrefix,
      author: options.author,
      authorId: options.authorId,
      ownerId: options.ownerId,
      timeout: options.timeout,
      time: options.time,
      timeoutSeconds: options.timeoutSeconds,
      idle: options.idle,
      thirdPartyMode: options.thirdPartyMode || (options.author || options.authorId || options.ownerId ? "reject" : "allow"),
      thirdPartyMessage: options.thirdPartyMessage,
      onEnd: options.onEnd || "disable",
      onEndHandler: options.onEndHandler,
      isEphemeral: options.isEphemeral,
      state: { pageIndex: initialPage },
      render: (renderCtx) => this.#renderPage(renderCtx),
      actions: {
        first: ({ setState }) => {
          setState({ pageIndex: 0 });
        },
        prev: ({ state, setState }) => {
          const prevIdx =
            state.pageIndex <= 0 ? (this.#wrap ? totalPages - 1 : 0) : state.pageIndex - 1;
          setState({ pageIndex: prevIdx });
        },
        next: ({ state, setState }) => {
          const nextIdx =
            state.pageIndex + 1 >= totalPages ? (this.#wrap ? 0 : totalPages - 1) : state.pageIndex + 1;
          setState({ pageIndex: nextIdx });
        },
        last: ({ setState }) => {
          setState({ pageIndex: totalPages - 1 });
        },
        close: ({ view }) => {
          view.stop(options.closeReason || "closed");
        },
      },
    });
  }

  get view() {
    return this.#view;
  }

  get pageIndex() {
    return this.#view.state.pageIndex;
  }

  get totalPages() {
    return this.#pages.length;
  }

  get collector() {
    return this.#view.collector;
  }

  get message() {
    return this.#view.message;
  }

  #buildControls(view, pageIndex, isEnded) {
    const totalPages = this.#pages.length;
    const disabledAll = Boolean(isEnded);
    const prevDisabled = disabledAll || totalPages <= 1 || (!this.#wrap && pageIndex <= 0);
    const nextDisabled = disabledAll || totalPages <= 1 || (!this.#wrap && pageIndex >= totalPages - 1);

    const prevCfg = this.#options.prevButton || {};
    const nextCfg = this.#options.nextButton || {};
    const closeCfg = this.#options.closeButton;

    const buttons = [];

    if (this.#options.showFirstLast && totalPages > 2) {
      buttons.push({
        label: this.#options.firstButton?.label ?? "<<",
        emoji: this.#options.firstButton?.emoji,
        style: this.#options.firstButton?.style || "secondary",
        customId: view.id("first"),
        disabled: prevDisabled,
      });
    }

    buttons.push({
      label: prevCfg.label ?? (prevCfg.emoji ? undefined : "Anterior"),
      emoji: prevCfg.emoji,
      style: prevCfg.style || "secondary",
      customId: view.id("prev"),
      disabled: prevDisabled,
    });

    if (this.#options.showPageIndicator !== false) {
      buttons.push({
        label:
          typeof this.#options.pageIndicatorFormatter === "function"
            ? this.#options.pageIndicatorFormatter(pageIndex + 1, totalPages)
            : `${pageIndex + 1} / ${totalPages}`,
        style: "secondary",
        customId: view.id("noop"),
        disabled: true,
      });
    }

    buttons.push({
      label: nextCfg.label ?? (nextCfg.emoji ? undefined : "Siguiente"),
      emoji: nextCfg.emoji,
      style: nextCfg.style || "secondary",
      customId: view.id("next"),
      disabled: nextDisabled,
    });

    if (this.#options.showFirstLast && totalPages > 2) {
      buttons.push({
        label: this.#options.lastButton?.label ?? ">>",
        emoji: this.#options.lastButton?.emoji,
        style: this.#options.lastButton?.style || "secondary",
        customId: view.id("last"),
        disabled: nextDisabled,
      });
    }

    if (closeCfg) {
      const cfgObj = typeof closeCfg === "object" ? closeCfg : {};
      buttons.push({
        label: cfgObj.label ?? (cfgObj.emoji ? undefined : "Cerrar"),
        emoji: cfgObj.emoji,
        style: cfgObj.style || "danger",
        customId: view.id("close"),
        disabled: disabledAll,
      });
    }

    return buttons;
  }

  #renderPage({ state, view, isEnded, isEphemeral }) {
    const totalPages = this.#pages.length;
    const pageIndex = Math.min(Math.max(0, state.pageIndex || 0), totalPages - 1);
    const pageData = this.#pages[pageIndex];
    const controls = this.#buildControls(view, pageIndex, isEnded);

    if (typeof this.#options.renderPage === "function") {
      const custom = this.#options.renderPage({
        page: pageData,
        pageIndex,
        pageNumber: pageIndex + 1,
        totalPages,
        totalItems: this.#totalItems,
        startIndex: pageIndex * this.#perPage,
        items: Array.isArray(pageData) ? pageData : undefined,
        controls,
        view,
        state,
        isEnded,
        isEphemeral,
        prevId: view.id("prev"),
        nextId: view.id("next"),
        closeId: view.id("close"),
      });

      if (ComponentsV2Builder.isBuilder(custom)) {
        return custom;
      }
      return custom;
    }

    if (ComponentsV2Builder.isBuilder(pageData)) {
      const basePayload = pageData.toPayload({ ephemeral: isEphemeral });
      if (this.#options.appendControlsToPrebuilt !== false && controls.length > 0) {
        const controlsRow = new ComponentsV2Builder().outside().addButtonsRow(controls.slice(0, 5)).build()[0];
        return {
          ...basePayload,
          components: [...basePayload.components, controlsRow],
        };
      }
      return basePayload;
    }

    const listItems = Array.isArray(pageData) ? pageData : [pageData];
    const showNav = totalPages > 1 || Boolean(this.#options.closeButton) || this.#options.alwaysShowControls;
    const controlsSlice = showNav ? controls.slice(0, 5) : [];

    return ComponentsV2Builder.list({
      color: this.#options.color ?? this.#options.accentColor,
      title: this.#options.title,
      subtitle: this.#options.subtitle,
      thumbnail: this.#options.thumbnail,
      items: listItems,
      renderItem: this.#options.renderItem,
      numbered: this.#options.numbered,
      startIndex: pageIndex * this.#perPage,
      emptyText: this.#options.emptyText,
      page: pageIndex + 1,
      totalPages,
      totalItems: this.#options.pages ? undefined : this.#totalItems,
      footer: this.#options.footer,
      buttons: this.#options.outsideControls ? undefined : controlsSlice,
      outsideButtons: this.#options.outsideControls ? controlsSlice : undefined,
    });
  }

  toPayload(options = {}) {
    return this.#view.toPayload(options);
  }

  attach(messageTarget, collectorOptions = {}) {
    return this.#view.attach(messageTarget, collectorOptions);
  }

  stop(reason = "stopped") {
    return this.#view.stop(reason);
  }

  async send(target, sendOptions = {}) {
    return this.#view.send(target, sendOptions);
  }
}

exports.V2Paginator = V2Paginator;
