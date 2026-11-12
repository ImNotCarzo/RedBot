"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectMenuProxy = exports.ComponentsV2Builder = void 0;

const path_1 = require("path");
const discord_js_1 = require("discord.js");
const helpers_js_1 = require("./components/helpers.js");
const StyleMapper_js_1 = require("./components/StyleMapper.js");
const text_js_1 = require("./components/text.js");
const templates = require("./components/templates.js");

const SELECT_TYPE_MAP = {
  string: "string",
  user: "user",
  role: "role",
  channel: "channel",
  mentionable: "mentionable",
};

function sanitizeAttachmentName(name, fallback = "file.bin") {
  const raw = String(name || "").trim();
  if (!raw) return fallback;
  const base = path_1.basename(raw).replace(/\s+/g, "_");
  return base || fallback;
}

function splitTextIntoChunks(text, maxChunkSize) {
  const limit = Math.max(10, Number(maxChunkSize) || 1900);
  const chunks = [];
  let remaining = String(text ?? "");

  while (remaining.length > limit) {
    let sliceAt = remaining.lastIndexOf("\n", limit);
    if (sliceAt < Math.floor(limit * 0.4)) {
      sliceAt = remaining.lastIndexOf(" ", limit);
    }
    if (sliceAt < Math.floor(limit * 0.4)) {
      sliceAt = limit;
    }
    const piece = remaining.slice(0, sliceAt).trimEnd();
    if (piece.length > 0) chunks.push(piece);
    remaining = remaining.slice(sliceAt).replace(/^\n+/, "");
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

/**
 * Proxy for configuring a StringSelectMenuBuilder using chained `.addOption(...)`
 * and returning to the parent ComponentsV2Builder with `.end()`.
 */
class SelectMenuProxy {
  #parent;
  #menu;

  constructor(parent, menu) {
    this.#parent = parent;
    this.#menu = menu;
  }

  /**
   * Adds an option to the select menu.
   * Supports positional args `(label, value, description?, emoji?, isDefault?)`
   * or an option object `{ label, value, description, emoji, default }`.
   */
  addOption(labelOrOption, value, description, emoji, isDefault) {
    const currentCount = this.#menu.options ? this.#menu.options.length : 0;
    helpers_js_1.validateSelectMenuOptions(currentCount + 1);

    let optionBuilder;
    if (labelOrOption instanceof discord_js_1.StringSelectMenuOptionBuilder) {
      optionBuilder = labelOrOption;
    } else {
      const cfg =
        labelOrOption && typeof labelOrOption === "object"
          ? labelOrOption
          : { label: labelOrOption, value, description, emoji, default: isDefault };

      const optLabel = String(cfg.label ?? "").trim();
      const optValue = String(cfg.value ?? optLabel);
      if (!optLabel || !optValue) {
        throw new Error("[ComponentsV2Builder] Select menu options require non-empty label and value.");
      }

      optionBuilder = new discord_js_1.StringSelectMenuOptionBuilder().setLabel(optLabel).setValue(optValue);

      if (cfg.description) {
        optionBuilder.setDescription(String(cfg.description));
      }
      if (cfg.emoji) {
        const parsedEmoji = helpers_js_1.parseEmoji(cfg.emoji);
        if (parsedEmoji) optionBuilder.setEmoji(parsedEmoji);
      }
      if (cfg.default !== undefined) {
        optionBuilder.setDefault(Boolean(cfg.default));
      }
    }

    this.#menu.addOptions(optionBuilder);
    return this;
  }

  /**
   * Adds multiple options at once (objects, tuples `[label, value, description?, emoji?, default?]`, or builders).
   */
  addOptions(options) {
    if (!Array.isArray(options)) return this;
    for (const item of options) {
      if (!item) continue;
      if (Array.isArray(item)) {
        this.addOption(item[0], item[1], item[2], item[3], item[4]);
      } else {
        this.addOption(item);
      }
    }
    return this;
  }

  setPlaceholder(placeholder) {
    this.#menu.setPlaceholder(String(placeholder));
    return this;
  }

  setMinValues(min) {
    this.#menu.setMinValues(Number(min));
    return this;
  }

  setMaxValues(max) {
    this.#menu.setMaxValues(Number(max));
    return this;
  }

  setDisabled(disabled = true) {
    this.#menu.setDisabled(Boolean(disabled));
    return this;
  }

  /**
   * Finishes configuring the select menu and returns to the parent ComponentsV2Builder.
   */
  end() {
    return this.#parent;
  }
}
exports.SelectMenuProxy = SelectMenuProxy;

/**
 * Fluent builder for Discord Components V2 messages with full support for
 * Containers, Sections, MediaGalleries, Files/Attachments, typed SelectMenus,
 * smart emojis, outside rows, limit guards, and ready-to-send payloads.
 */
class ComponentsV2Builder {
  #topLevel = [];
  #activeContainerEntry;
  #placement = "inside";
  #currentRow = null;
  #currentRowPlacement = null;
  #files = [];
  #defaultSafeMentions = true;
  #lastKindByTarget = { inside: null, outside: null };

  static flags = discord_js_1.MessageFlags.IsComponentsV2;
  static MAX_TEXT_LENGTH = helpers_js_1.MAX_V2_TEXT_LENGTH;
  static SAFE_TEXT_LENGTH = helpers_js_1.SAFE_V2_TEXT_LENGTH;
  static MAX_COMPONENTS = helpers_js_1.MAX_V2_COMPONENTS;
  static MAX_TOP_LEVEL_COMPONENTS = helpers_js_1.MAX_V2_TOP_LEVEL_COMPONENTS;
  static text = text_js_1.V2Text;
  static clipText = helpers_js_1.clipText;
  static resolveColor = helpers_js_1.resolveAccentColor;
  static parseEmoji = helpers_js_1.parseEmoji;
  static isValidMediaUrl = helpers_js_1.isValidMediaUrl;
  static isValidLinkUrl = helpers_js_1.isValidLinkUrl;
  static disableComponents = helpers_js_1.disableComponents;
  static disableMessageComponents = helpers_js_1.disableMessageComponents;
  static countTextLength = helpers_js_1.countTextLength;
  static countComponents = helpers_js_1.countComponents;

  static isBuilder(value) {
    return Boolean(
      value &&
        (value instanceof ComponentsV2Builder ||
          (typeof value === "object" && typeof value.toPayload === "function" && typeof value.build === "function"))
    );
  }

  constructor(options = {}) {
    this.#defaultSafeMentions = options.safeMentions !== false;
    this.#activeContainerEntry = this.#createContainerEntry(options);
  }

  #createContainerEntry(options = {}) {
    const container = new discord_js_1.ContainerBuilder();
    const colorInput = options.color !== undefined ? options.color : options.accentColor;
    if (colorInput !== undefined && colorInput !== null) {
      const resolved = helpers_js_1.resolveAccentColor(colorInput);
      if (resolved !== null) container.setAccentColor(resolved);
    }
    if (options.spoiler) {
      container.setSpoiler(true);
    }
    return {
      kind: "container",
      builder: container,
      hasContent: false,
      attached: false,
    };
  }

  #ensureContainerAttached(entry) {
    if (!entry.attached) {
      this.#topLevel.push(entry);
      entry.attached = true;
    }
  }

  #flushPendingRow() {
    if (!this.#currentRow || !this.#currentRow.components?.length) {
      this.#currentRow = null;
      this.#currentRowPlacement = null;
      return;
    }
    const row = this.#currentRow;
    const placement = this.#currentRowPlacement || "inside";
    this.#currentRow = null;
    this.#currentRowPlacement = null;
    this.#appendDirect(row, "actionRow", placement);
  }

  #appendDirect(component, kind, placement = this.#placement) {
    if (placement === "outside") {
      this.#topLevel.push({ kind: "outside", component });
      this.#lastKindByTarget.outside = kind;
      return;
    }

    const entry = this.#activeContainerEntry;
    this.#ensureContainerAttached(entry);
    entry.hasContent = true;

    const c = entry.builder;
    switch (kind) {
      case "text":
        c.addTextDisplayComponents(component);
        break;
      case "separator":
        c.addSeparatorComponents(component);
        break;
      case "section":
        c.addSectionComponents(component);
        break;
      case "gallery":
        c.addMediaGalleryComponents(component);
        break;
      case "file":
        c.addFileComponents(component);
        break;
      case "actionRow":
        c.addActionRowComponents(component);
        break;
      default:
        throw new TypeError(`[ComponentsV2Builder] Unsupported component kind: ${String(kind)}`);
    }
    this.#lastKindByTarget.inside = kind;
  }

  #appendComponent(component, kind) {
    this.#flushPendingRow();
    this.#appendDirect(component, kind, this.#placement);
  }

  #ensureActionRow() {
    if (this.#currentRow && this.#currentRowPlacement !== this.#placement) {
      this.#flushPendingRow();
    }
    if (!this.#currentRow || this.#currentRow.components.length >= 5) {
      this.#flushPendingRow();
      this.#currentRow = new discord_js_1.ActionRowBuilder();
      this.#currentRowPlacement = this.#placement;
    }
    return this.#currentRow;
  }

  #createButton(input, customIdArg, styleArg, urlArg, extraArg) {
    if (input instanceof discord_js_1.ButtonBuilder) {
      return input;
    }

    const cfg =
      input && typeof input === "object"
        ? input
        : {
            label: input,
            customId: customIdArg,
            style: styleArg,
            url: urlArg,
            ...(extraArg && typeof extraArg === "object" ? extraArg : {}),
          };

    const button = new discord_js_1.ButtonBuilder();
    const resolvedStyle =
      cfg.style !== undefined && cfg.style !== null
        ? StyleMapper_js_1.mapButtonStyle(cfg.style)
        : cfg.url
        ? discord_js_1.ButtonStyle.Link
        : discord_js_1.ButtonStyle.Primary;

    button.setStyle(resolvedStyle);

    const parsedEmoji = cfg.emoji ? helpers_js_1.parseEmoji(cfg.emoji) : null;
    const hasLabel = cfg.label !== undefined && cfg.label !== null && String(cfg.label) !== "";

    if (hasLabel) {
      button.setLabel(String(cfg.label));
    }
    if (parsedEmoji) {
      button.setEmoji(parsedEmoji);
    }

    const isLink = resolvedStyle === discord_js_1.ButtonStyle.Link;
    const isPremium = discord_js_1.ButtonStyle.Premium !== undefined && resolvedStyle === discord_js_1.ButtonStyle.Premium;

    if (!hasLabel && !parsedEmoji && !isPremium) {
      throw new Error("[ComponentsV2Builder] A button requires a label, an emoji, or Premium skuId.");
    }

    if (isLink) {
      if (!helpers_js_1.isValidLinkUrl(cfg.url)) {
        throw new Error(`[ComponentsV2Builder] Link buttons require a valid http(s)/discord URL (received: ${String(cfg.url)}).`);
      }
      button.setURL(String(cfg.url).trim());
    } else if (isPremium) {
      if (!cfg.skuId) {
        throw new Error("[ComponentsV2Builder] Premium buttons require a valid skuId.");
      }
      button.setSKUId(String(cfg.skuId));
    } else {
      const id = cfg.customId ?? cfg.id ?? helpers_js_1.generateCustomId("btn");
      button.setCustomId(String(id));
    }

    if (cfg.disabled !== undefined) {
      button.setDisabled(Boolean(cfg.disabled));
    }

    return button;
  }

  #normalizeTextInput(content, options = {}) {
    if (content instanceof discord_js_1.TextDisplayBuilder) {
      return content.data?.content ?? "";
    }
    if (Array.isArray(content)) {
      const lines = content
        .filter((line) => line !== false && line !== null && line !== undefined)
        .map((line) => (line instanceof discord_js_1.TextDisplayBuilder ? line.data?.content ?? "" : String(line)))
        .filter((line) => line.trim().length > 0);
      return lines.join(options.joinWith ?? "\n");
    }
    return content;
  }

  /**
   * Sets or clears the accent color of the active container.
   */
  setColor(color) {
    if (color === null) {
      this.#activeContainerEntry.builder.clearAccentColor();
      return this;
    }
    const resolved = helpers_js_1.resolveAccentColor(color);
    if (resolved !== null) {
      this.#activeContainerEntry.builder.setAccentColor(resolved);
    }
    return this;
  }

  /**
   * Alias of `setColor(color)`.
   */
  setAccentColor(color) {
    return this.setColor(color);
  }

  /**
   * Sets whether the active container is marked as a spoiler.
   */
  setSpoiler(spoiler = true) {
    this.#activeContainerEntry.builder.setSpoiler(Boolean(spoiler));
    return this;
  }

  /**
   * Starts a new ContainerBuilder (switching placement back to `"inside"`).
   */
  addContainer(options = {}) {
    this.#flushPendingRow();
    const nextEntry = this.#createContainerEntry(options);
    if (
      !this.#activeContainerEntry.hasContent &&
      !this.#activeContainerEntry.attached &&
      this.#topLevel.length === 0
    ) {
      this.#activeContainerEntry = nextEntry;
    } else {
      this.#activeContainerEntry = nextEntry;
      this.#ensureContainerAttached(nextEntry);
    }
    this.#placement = "inside";
    this.#lastKindByTarget.inside = null;
    return this;
  }

  /**
   * Switches component placement outside the container (top-level message components).
   */
  outside() {
    this.#flushPendingRow();
    this.#placement = "outside";
    return this;
  }

  /**
   * Switches component placement back inside the active container (or creates one if `options.new` is true).
   */
  inside(options = {}) {
    this.#flushPendingRow();
    if (options?.new || options?.newContainer) {
      return this.addContainer(options);
    }
    this.#placement = "inside";
    if (options && (options.color !== undefined || options.accentColor !== undefined)) {
      this.setColor(options.color !== undefined ? options.color : options.accentColor);
    }
    if (options?.spoiler !== undefined) {
      this.setSpoiler(options.spoiler);
    }
    return this;
  }

  /**
   * Adds a TextDisplay component. Pass `{ ignoreEmpty: true }` to skip empty/whitespace text safely.
   */
  addText(content, options = {}) {
    if (content instanceof discord_js_1.TextDisplayBuilder) {
      this.#appendComponent(content, "text");
      return this;
    }

    const normalized = this.#normalizeTextInput(content, options);
    if (!helpers_js_1.validateTextContent(normalized, options)) {
      return this;
    }

    const finalText = options.maxLength ? helpers_js_1.clipText(normalized, options.maxLength) : String(normalized);
    if (!helpers_js_1.validateTextContent(finalText, options)) {
      return this;
    }

    const textComponent = new discord_js_1.TextDisplayBuilder().setContent(finalText);
    this.#appendComponent(textComponent, "text");
    return this;
  }

  /**
   * Adds formatted key/value rows (`> **Label:** value`), filtering falsy/empty rows automatically.
   */
  addFields(rows, options = {}) {
    const formatted = text_js_1.V2Text.fields(rows, options);
    if (!formatted && options.omitIfEmpty !== false) {
      return this;
    }
    if (!formatted) return this;
    return this.addText(formatted, options);
  }

  /**
   * Adds an independent section block (`**Heading**\n> **Label:** value`) with optional divider before it.
   */
  addSectionBlock(heading, rows, options = {}) {
    const formatted = text_js_1.V2Text.sectionBlock(heading, rows, options);
    if (!formatted) return this;

    const targetHasContent =
      this.#placement === "outside"
        ? this.#topLevel.some((e) => e.kind === "outside")
        : this.#activeContainerEntry.hasContent;

    const wantsSeparator = options.separator !== false;
    const lastKind = this.#lastKindByTarget[this.#placement];
    if (targetHasContent && wantsSeparator && lastKind !== "separator") {
      const spacing = typeof options.separator === "string" ? options.separator : "small";
      this.addSeparator(spacing, true);
    }

    return this.addText(formatted, options);
  }

  /**
   * Adds a blockquote TextDisplay block.
   */
  addQuote(text, options = {}) {
    if (options.ignoreEmpty && (text === undefined || text === null || String(text).trim() === "")) {
      return this;
    }
    const quoted = text_js_1.V2Text.quote(text, options.maxLength, options.fallback);
    if (!quoted) return this;
    return this.addText(quoted, options);
  }

  /**
   * Adds text while protecting against Discord V2 text length limits (`overflow: "file" | "clip" | "split"`).
   */
  addSmartText(text, options = {}) {
    const raw = String(text ?? "");
    if (raw.trim().length === 0) {
      if (options.ignoreEmpty) return this;
      helpers_js_1.validateTextContent(raw, options);
    }

    const budgetLeft = this.remainingChars;
    const hardLimit = options.maxLength ?? helpers_js_1.SAFE_V2_TEXT_LENGTH;
    const effectiveLimit = Math.max(0, Math.min(hardLimit, budgetLeft));

    if (raw.length <= effectiveLimit && effectiveLimit > 0) {
      return this.addText(options.codeBlock ? `\`\`\`${options.codeBlock}\n${raw}\n\`\`\`` : raw);
    }

    const overflow = options.overflow || "file";

    if (overflow === "clip") {
      if (effectiveLimit <= 0) return this;
      const clipped = helpers_js_1.clipText(raw, effectiveLimit);
      return this.addText(clipped, { ignoreEmpty: true });
    }

    if (overflow === "split") {
      const chunkSize = Math.min(options.chunkSize ?? 1900, helpers_js_1.SAFE_V2_TEXT_LENGTH);
      const chunks = splitTextIntoChunks(raw, chunkSize);
      const overflowChunks = [];

      for (const chunk of chunks) {
        const canFitChars = this.remainingChars;
        const canFitComponents = this.remainingComponents;
        if (chunk.length <= canFitChars && canFitComponents >= 2) {
          this.addText(chunk);
        } else {
          overflowChunks.push(chunk);
        }
      }

      if (overflowChunks.length > 0) {
        const leftover = overflowChunks.join("\n\n");
        if (options.fallbackToFile !== false) {
          this.addFile(Buffer.from(raw, "utf8"), {
            name: options.filename || "output.txt",
            description: options.fileDescription,
            spoiler: options.spoiler,
          });
        } else if (this.remainingChars > 10) {
          this.addText(helpers_js_1.clipText(leftover, this.remainingChars), { ignoreEmpty: true });
        }
      }
      return this;
    }

    // overflow === "file"
    const filename = options.filename || "output.txt";
    const notice = options.overflowNotice ?? `-# Contenido completo adjunto en \`${sanitizeAttachmentName(filename, "output.txt")}\`.`;

    if (options.preview !== false) {
      const codePrefix = options.codeBlock ? `\`\`\`${options.codeBlock}\n` : "";
      const codeSuffix = options.codeBlock ? "\n```" : "";
      const overhead = codePrefix.length + codeSuffix.length + (notice ? notice.length + 2 : 0);
      const maxPreviewLen = Math.min(options.previewLimit ?? 600, Math.max(0, effectiveLimit - overhead));

      if (maxPreviewLen >= 40) {
        const clippedPreview = helpers_js_1.clipText(raw, maxPreviewLen);
        const body = `${codePrefix}${clippedPreview}${codeSuffix}${notice ? `\n${notice}` : ""}`;
        this.addText(body, { ignoreEmpty: true });
      } else if (notice && notice.length <= effectiveLimit) {
        this.addText(notice, { ignoreEmpty: true });
      }
    }

    return this.addFile(Buffer.from(raw, "utf8"), {
      name: filename,
      description: options.fileDescription,
      spoiler: options.spoiler,
    });
  }

  /**
   * Adds a Section (1-3 TextDisplay components paired with a Thumbnail or Button accessory).
   * Falls back to `addText` automatically when no valid accessory is supplied (unless `fallbackToText: false`).
   */
  addSection(texts, accessoryOrOptions = {}) {
    let options = {};
    let thumbnailAccessory = null;
    let buttonAccessory = null;

    if (accessoryOrOptions instanceof discord_js_1.ThumbnailBuilder) {
      thumbnailAccessory = accessoryOrOptions;
    } else if (accessoryOrOptions instanceof discord_js_1.ButtonBuilder) {
      buttonAccessory = accessoryOrOptions;
    } else if (accessoryOrOptions && typeof accessoryOrOptions === "object") {
      options = accessoryOrOptions;
      if (options.thumbnail instanceof discord_js_1.ThumbnailBuilder) {
        thumbnailAccessory = options.thumbnail;
      } else if (options.thumbnail) {
        const thumbCfg = typeof options.thumbnail === "string" ? { url: options.thumbnail } : options.thumbnail;
        if (thumbCfg && helpers_js_1.isValidMediaUrl(thumbCfg.url)) {
          thumbnailAccessory = new discord_js_1.ThumbnailBuilder().setURL(thumbCfg.url.trim());
          const desc = thumbCfg.description ?? options.thumbnailDescription;
          if (desc) thumbnailAccessory.setDescription(String(desc));
          const spoiler = thumbCfg.spoiler ?? options.thumbnailSpoiler;
          if (spoiler !== undefined) thumbnailAccessory.setSpoiler(Boolean(spoiler));
        }
      }

      if (!thumbnailAccessory && options.button) {
        buttonAccessory = this.#createButton(options.button);
      }
    }

    const textBuilders = [];
    if (Array.isArray(texts) && texts.some((item) => item instanceof discord_js_1.TextDisplayBuilder)) {
      for (const item of texts) {
        if (!item) continue;
        if (item instanceof discord_js_1.TextDisplayBuilder) {
          textBuilders.push(item);
        } else {
          const str = String(item).trim();
          if (str) textBuilders.push(new discord_js_1.TextDisplayBuilder().setContent(str));
        }
      }
    } else {
      const normalized = this.#normalizeTextInput(texts, options);
      if (!helpers_js_1.validateTextContent(normalized, options)) {
        return this;
      }
      const finalText = options.maxLength ? helpers_js_1.clipText(normalized, options.maxLength) : String(normalized);
      textBuilders.push(new discord_js_1.TextDisplayBuilder().setContent(finalText));
    }

    if (textBuilders.length === 0) {
      if (options.ignoreEmpty) return this;
      throw new Error("[ComponentsV2Builder] Section requires at least one non-empty text display.");
    }

    if (!thumbnailAccessory && !buttonAccessory) {
      if (options.fallbackToText !== false) {
        for (const tb of textBuilders) {
          this.#appendComponent(tb, "text");
        }
        return this;
      }
      throw new Error("[ComponentsV2Builder] Section requires a valid thumbnail URL or button accessory.");
    }

    if (textBuilders.length > 3) {
      const merged = textBuilders.map((tb) => tb.data?.content || "").filter(Boolean).join("\n");
      textBuilders.length = 0;
      textBuilders.push(new discord_js_1.TextDisplayBuilder().setContent(merged));
    }

    const section = new discord_js_1.SectionBuilder().addTextDisplayComponents(...textBuilders);
    if (thumbnailAccessory) {
      section.setThumbnailAccessory(thumbnailAccessory);
    } else if (buttonAccessory) {
      section.setButtonAccessory(buttonAccessory);
    }

    this.#appendComponent(section, "section");
    return this;
  }

  /**
   * Adds a MediaGallery component (`http://`, `https://`, or `attachment://` URLs).
   */
  addGallery(itemsOrUrl, options = {}) {
    if (itemsOrUrl instanceof discord_js_1.MediaGalleryBuilder) {
      this.#appendComponent(itemsOrUrl, "gallery");
      return this;
    }

    const rawList = Array.isArray(itemsOrUrl) ? itemsOrUrl : [itemsOrUrl];
    const validItems = [];

    for (const entry of rawList) {
      if (!entry) {
        if (options.ignoreEmpty || options.ignoreInvalid) continue;
        if (!Array.isArray(itemsOrUrl)) {
          throw new Error("[ComponentsV2Builder] Invalid or empty media URL for MediaGallery.");
        }
        continue;
      }

      if (entry instanceof discord_js_1.MediaGalleryItemBuilder) {
        validItems.push(entry);
        continue;
      }

      const cfg = typeof entry === "string" ? { url: entry } : entry;
      const url = cfg?.url;
      if (!helpers_js_1.isValidMediaUrl(url)) {
        if (options.ignoreInvalid) continue;
        throw new Error(`[ComponentsV2Builder] Invalid media URL for MediaGallery: ${String(url)}`);
      }

      const item = new discord_js_1.MediaGalleryItemBuilder().setURL(url.trim());
      const desc = cfg.description ?? options.description;
      if (desc) item.setDescription(String(desc));
      const spoiler = cfg.spoiler ?? options.spoiler;
      if (spoiler !== undefined) item.setSpoiler(Boolean(spoiler));
      validItems.push(item);
    }

    if (validItems.length === 0) {
      if (options.ignoreEmpty || options.ignoreInvalid) return this;
      throw new Error("[ComponentsV2Builder] MediaGallery requires at least one valid media item.");
    }

    if (validItems.length > 10 && !options.autoSplit) {
      throw new Error("[ComponentsV2Builder] A MediaGallery cannot contain more than 10 items.");
    }

    for (let i = 0; i < validItems.length; i += 10) {
      const slice = validItems.slice(i, i + 10);
      const gallery = new discord_js_1.MediaGalleryBuilder().addItems(...slice);
      this.#appendComponent(gallery, "gallery");
    }
    return this;
  }

  /**
   * Attaches an AttachmentBuilder without emitting a File component (useful for `attachment://` galleries/thumbnails).
   */
  addAttachment(source, options = {}) {
    if (source instanceof discord_js_1.AttachmentBuilder) {
      if (options.name) source.setName(sanitizeAttachmentName(options.name));
      if (options.description) source.setDescription(String(options.description));
      this.#files.push(source);
      return this;
    }

    const defaultName = typeof source === "string" ? path_1.basename(source) : "file.bin";
    const filename = sanitizeAttachmentName(options.name || defaultName);
    const attachmentOptions = { name: filename };
    if (options.description) attachmentOptions.description = String(options.description);

    const attachment = new discord_js_1.AttachmentBuilder(source, attachmentOptions);
    this.#files.push(attachment);
    return this;
  }

  /**
   * Adds a File component and automatically registers its AttachmentBuilder in `files`.
   * If `source` is already an `attachment://...` URL, adds only the File component.
   */
  addFile(source, options = {}) {
    if (source instanceof discord_js_1.FileBuilder) {
      this.#appendComponent(source, "file");
      return this;
    }

    let attachmentUrl;
    if (typeof source === "string" && /^attachment:\/\/[^\s/]+$/i.test(source.trim())) {
      attachmentUrl = source.trim();
      if (options.attachment) {
        this.addAttachment(options.attachment, options);
      }
    } else if (source instanceof discord_js_1.AttachmentBuilder) {
      const name = sanitizeAttachmentName(options.name || source.name || "file.bin");
      if (!source.name) source.setName(name);
      this.addAttachment(source, { ...options, name });
      attachmentUrl = `attachment://${source.name}`;
    } else {
      const defaultName = typeof source === "string" ? path_1.basename(source) : "file.bin";
      const name = sanitizeAttachmentName(options.name || defaultName);
      this.addAttachment(source, { ...options, name });
      attachmentUrl = `attachment://${name}`;
    }

    const fileBuilder = new discord_js_1.FileBuilder().setURL(attachmentUrl);
    if (options.spoiler !== undefined) {
      fileBuilder.setSpoiler(Boolean(options.spoiler));
    }
    this.#appendComponent(fileBuilder, "file");
    return this;
  }

  /**
   * Adds a visual separator or empty spacer (`divider: false`).
   */
  addSeparator(spacing = "small", divider = true) {
    let spacingArg = spacing;
    let dividerArg = divider;

    if (spacing && typeof spacing === "object") {
      spacingArg = spacing.spacing ?? "small";
      dividerArg = spacing.divider !== undefined ? Boolean(spacing.divider) : true;
    }

    const size =
      spacingArg === "large" || spacingArg === discord_js_1.SeparatorSpacingSize.Large
        ? discord_js_1.SeparatorSpacingSize.Large
        : discord_js_1.SeparatorSpacingSize.Small;

    const separator = new discord_js_1.SeparatorBuilder().setSpacing(size).setDivider(Boolean(dividerArg));
    this.#appendComponent(separator, "separator");
    return this;
  }

  /**
   * Shorthand for an invisible vertical spacer (`addSeparator(spacing, false)`).
   */
  addSpacer(spacing = "small") {
    return this.addSeparator(spacing, false);
  }

  /**
   * Adds a button to the current button ActionRow (creating a new row automatically at 5 buttons).
   * Supports both an options object `{ label, customId, id, style, url, emoji, disabled }`
   * and legacy positional args `(label, customId, style, url)`.
   */
  addButton(labelOrConfig, customId, style, url, extraOptions) {
    const button = this.#createButton(labelOrConfig, customId, style, url, extraOptions);
    this.#ensureActionRow().addComponents(button);
    return this;
  }

  /**
   * Adds a dedicated ActionRow containing up to 5 buttons (flushes any previous open button row).
   */
  addButtons(buttons, options = {}) {
    this.#flushPendingRow();
    const list = (Array.isArray(buttons) ? buttons : []).filter(Boolean);
    if (list.length === 0) return this;

    if (!options.autoWrap) {
      helpers_js_1.validateButtonCount(list.length);
    }

    for (let i = 0; i < list.length; i += 5) {
      const chunk = list.slice(i, i + 5);
      const row = new discord_js_1.ActionRowBuilder();
      for (const item of chunk) {
        if (Array.isArray(item)) {
          row.addComponents(this.#createButton(item[0], item[1], item[2], item[3], item[4]));
        } else {
          row.addComponents(this.#createButton(item));
        }
      }
      this.#appendDirect(row, "actionRow", this.#placement);
    }

    return this;
  }

  /**
   * Alias of `addButtons(buttons, options)` for explicit ActionRow ergonomics.
   */
  addButtonsRow(buttons, options = {}) {
    return this.addButtons(buttons, options);
  }

  /**
   * Starts a legacy chained StringSelectMenu (`SelectMenuProxy`) OR adds a full select menu
   * when passed an options object `{ customId, type, placeholder, options, ... }`.
   */
  addSelectMenu(customIdOrConfig, placeholder = "Select an option") {
    if (customIdOrConfig && typeof customIdOrConfig === "object") {
      return this.addSelectRow(customIdOrConfig);
    }

    this.#flushPendingRow();
    const select = new discord_js_1.StringSelectMenuBuilder()
      .setCustomId(String(customIdOrConfig || helpers_js_1.generateCustomId("select")))
      .setPlaceholder(String(placeholder));

    const row = new discord_js_1.ActionRowBuilder().addComponents(select);
    this.#appendDirect(row, "actionRow", this.#placement);
    return new SelectMenuProxy(this, select);
  }

  /**
   * Adds an ActionRow containing any Discord select menu (`string`, `user`, `role`, `channel`, `mentionable`).
   */
  addSelectRow(config = {}) {
    this.#flushPendingRow();
    const type = SELECT_TYPE_MAP[String(config.type || "string").toLowerCase()] || "string";
    const customId = String(config.customId ?? config.id ?? helpers_js_1.generateCustomId("select"));

    let menu;
    switch (type) {
      case "user":
        menu = new discord_js_1.UserSelectMenuBuilder();
        if (Array.isArray(config.defaultUsers) && config.defaultUsers.length > 0) {
          menu.setDefaultUsers(config.defaultUsers);
        } else if (Array.isArray(config.defaultValues) && config.defaultValues.length > 0) {
          menu.setDefaultUsers(config.defaultValues);
        }
        break;

      case "role":
        menu = new discord_js_1.RoleSelectMenuBuilder();
        if (Array.isArray(config.defaultRoles) && config.defaultRoles.length > 0) {
          menu.setDefaultRoles(config.defaultRoles);
        } else if (Array.isArray(config.defaultValues) && config.defaultValues.length > 0) {
          menu.setDefaultRoles(config.defaultValues);
        }
        break;

      case "channel":
        menu = new discord_js_1.ChannelSelectMenuBuilder();
        if (Array.isArray(config.channelTypes) && config.channelTypes.length > 0) {
          menu.setChannelTypes(config.channelTypes);
        }
        if (Array.isArray(config.defaultChannels) && config.defaultChannels.length > 0) {
          menu.setDefaultChannels(config.defaultChannels);
        } else if (Array.isArray(config.defaultValues) && config.defaultValues.length > 0) {
          menu.setDefaultChannels(config.defaultValues);
        }
        break;

      case "mentionable":
        menu = new discord_js_1.MentionableSelectMenuBuilder();
        if (Array.isArray(config.defaultValues) && config.defaultValues.length > 0) {
          menu.setDefaultValues(config.defaultValues);
        } else {
          if (Array.isArray(config.defaultUsers) && config.defaultUsers.length > 0) {
            menu.addDefaultUsers(config.defaultUsers);
          }
          if (Array.isArray(config.defaultRoles) && config.defaultRoles.length > 0) {
            menu.addDefaultRoles(config.defaultRoles);
          }
        }
        break;

      case "string":
      default: {
        menu = new discord_js_1.StringSelectMenuBuilder();
        const proxy = new SelectMenuProxy(this, menu);
        if (Array.isArray(config.options) && config.options.length > 0) {
          proxy.addOptions(config.options);
        }
        break;
      }
    }

    menu.setCustomId(customId);
    if (config.placeholder) menu.setPlaceholder(String(config.placeholder));
    if (config.minValues !== undefined) menu.setMinValues(Number(config.minValues));
    if (config.maxValues !== undefined) menu.setMaxValues(Number(config.maxValues));
    if (config.disabled !== undefined) menu.setDisabled(Boolean(config.disabled));

    const row = new discord_js_1.ActionRowBuilder().addComponents(menu);
    this.#appendDirect(row, "actionRow", this.#placement);
    return this;
  }

  addUserSelectMenu(configOrCustomId, options = {}) {
    const cfg = typeof configOrCustomId === "string" ? { ...options, customId: configOrCustomId } : { ...configOrCustomId };
    return this.addSelectRow({ ...cfg, type: "user" });
  }

  addRoleSelectMenu(configOrCustomId, options = {}) {
    const cfg = typeof configOrCustomId === "string" ? { ...options, customId: configOrCustomId } : { ...configOrCustomId };
    return this.addSelectRow({ ...cfg, type: "role" });
  }

  addChannelSelectMenu(configOrCustomId, options = {}) {
    const cfg = typeof configOrCustomId === "string" ? { ...options, customId: configOrCustomId } : { ...configOrCustomId };
    return this.addSelectRow({ ...cfg, type: "channel" });
  }

  addMentionableSelectMenu(configOrCustomId, options = {}) {
    const cfg = typeof configOrCustomId === "string" ? { ...options, customId: configOrCustomId } : { ...configOrCustomId };
    return this.addSelectRow({ ...cfg, type: "mentionable" });
  }

  /**
   * Adds a raw discord.js component builder respecting the current container/outside placement.
   */
  addComponent(component) {
    if (!component) return this;
    this.#flushPendingRow();

    if (component instanceof discord_js_1.ContainerBuilder) {
      this.#topLevel.push({ kind: "container", builder: component, hasContent: true, attached: true });
      return this;
    }

    const type = component?.data?.type;
    if (component instanceof discord_js_1.TextDisplayBuilder || type === (discord_js_1.ComponentType?.TextDisplay ?? 10)) {
      this.#appendDirect(component, "text", this.#placement);
    } else if (component instanceof discord_js_1.SeparatorBuilder || type === (discord_js_1.ComponentType?.Separator ?? 14)) {
      this.#appendDirect(component, "separator", this.#placement);
    } else if (component instanceof discord_js_1.SectionBuilder || type === (discord_js_1.ComponentType?.Section ?? 9)) {
      this.#appendDirect(component, "section", this.#placement);
    } else if (component instanceof discord_js_1.MediaGalleryBuilder || type === (discord_js_1.ComponentType?.MediaGallery ?? 12)) {
      this.#appendDirect(component, "gallery", this.#placement);
    } else if (component instanceof discord_js_1.FileBuilder || type === (discord_js_1.ComponentType?.File ?? 13)) {
      this.#appendDirect(component, "file", this.#placement);
    } else if (component instanceof discord_js_1.ActionRowBuilder || type === (discord_js_1.ComponentType?.ActionRow ?? 1)) {
      this.#appendDirect(component, "actionRow", this.#placement);
    } else {
      this.#topLevel.push({ kind: "outside", component });
    }
    return this;
  }

  /**
   * Total character count across all TextDisplay components added so far.
   */
  get textLength() {
    return helpers_js_1.countTextLength(this.#snapshotComponents());
  }

  /**
   * Remaining characters before reaching Discord's 4,000-char V2 text display limit.
   */
  get remainingChars() {
    return Math.max(0, helpers_js_1.MAX_V2_TEXT_LENGTH - this.textLength);
  }

  /**
   * Total component count (including nested Container, Section, ActionRow, and MediaGallery items).
   */
  get componentCount() {
    return helpers_js_1.countComponents(this.#snapshotComponents());
  }

  /**
   * Remaining component budget before reaching Discord's 40-component V2 limit.
   */
  get remainingComponents() {
    return Math.max(0, helpers_js_1.MAX_V2_COMPONENTS - this.componentCount);
  }

  /**
   * Shallow copy of all AttachmentBuilders registered via `.addFile()` or `.addAttachment()`.
   */
  get files() {
    return [...this.#files];
  }

  #snapshotComponents() {
    const out = [];
    for (const entry of this.#topLevel) {
      if (entry.kind === "container") {
        if (entry.hasContent) out.push(entry.builder);
      } else {
        out.push(entry.component);
      }
    }
    if (this.#currentRow && this.#currentRow.components?.length) {
      out.push(this.#currentRow);
    }
    return out;
  }

  /**
   * Builds and returns the array of top-level discord.js V2 component builders.
   */
  build() {
    this.#flushPendingRow();
    const result = [];
    for (const entry of this.#topLevel) {
      if (entry.kind === "container") {
        if (entry.hasContent) {
          result.push(entry.builder);
        }
      } else {
        result.push(entry.component);
      }
    }

    if (result.length === 0 && this.#topLevel.length === 0) {
      return [this.#activeContainerEntry.builder];
    }

    return result;
  }

  /**
   * Serializes the built top-level components into plain JSON objects.
   */
  toJSON() {
    return this.build().map((comp) => (typeof comp?.toJSON === "function" ? comp.toJSON() : comp));
  }

  /**
   * Builds a ready-to-send Discord message/interaction payload with `IsComponentsV2` flag,
   * optional ephemeral/notification flags, attached files, and safe `allowedMentions`.
   */
  toPayload(options = {}) {
    const components = this.build();
    let flags = discord_js_1.MessageFlags.IsComponentsV2;

    if (options.ephemeral) {
      flags |= discord_js_1.MessageFlags.Ephemeral;
    }
    if (options.suppressNotifications && discord_js_1.MessageFlags.SuppressNotifications !== undefined) {
      flags |= discord_js_1.MessageFlags.SuppressNotifications;
    }
    if (typeof options.flags === "number" && Number.isFinite(options.flags)) {
      flags |= options.flags;
    }

    const extraFiles = Array.isArray(options.files) ? options.files.filter(Boolean) : [];
    const mergedFiles = [...this.#files, ...extraFiles];

    const payload = {
      components,
      flags,
    };

    if (mergedFiles.length > 0) {
      payload.files = mergedFiles;
    }

    const useSafeMentions = options.safeMentions !== undefined ? options.safeMentions : this.#defaultSafeMentions;
    if (options.allowedMentions !== undefined) {
      payload.allowedMentions = options.allowedMentions;
    } else if (useSafeMentions) {
      payload.allowedMentions = { parse: [], repliedUser: false };
    }

    return payload;
  }

  // =========================================================================
  // Agnostic & legacy static template factories
  // =========================================================================

  static card(options) {
    return templates.createCard(options);
  }

  static imageView(options) {
    return templates.createImageView(options);
  }

  static list(options) {
    return templates.createList(options);
  }

  static confirm(confirmIdOrOptions, cancelId, title, message) {
    return templates.createConfirm(confirmIdOrOptions, cancelId, title, message);
  }

  static createConfirm(confirmIdOrOptions, cancelId, title, message) {
    return templates.createConfirm(confirmIdOrOptions, cancelId, title, message);
  }

  static createTicketMenu(customId, title, description) {
    return templates.createTicketMenu(customId, title, description);
  }

  static createPlanSelector(customId, title, description) {
    return templates.createPlanSelector(customId, title, description);
  }

  static createRoleMenu(customId, title, description) {
    return templates.createRoleMenu(customId, title, description);
  }
}

exports.ComponentsV2Builder = ComponentsV2Builder;
