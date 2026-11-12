"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoleMenu =
  exports.createPlanSelector =
  exports.createTicketMenu =
  exports.createConfirm =
  exports.createList =
  exports.createImageView =
  exports.createCard =
    void 0;

const { V2Text } = require("./text.js");
const { generateCustomId } = require("./helpers.js");

function getBuilder() {
  return require("../ComponentsV2Builder.js").ComponentsV2Builder;
}

function formatHeadingIfPlain(text, level = 3) {
  const str = String(text ?? "").trim();
  if (!str) return "";
  if (/^(?:#{1,3}\s|\*\*)/.test(str)) return str;
  return V2Text.heading(str, level);
}

function formatSubtextIfPlain(text) {
  const str = String(text ?? "").trim();
  if (!str) return "";
  if (str.startsWith("-# ")) return str;
  return V2Text.subtext(str);
}

/**
 * Builds an agnostic V2 card with optional header section (thumbnail/button),
 * description, fields, extra sections, media gallery, files, footer, and action buttons.
 */
function createCard(options = {}) {
  const Builder = getBuilder();
  const builder = new Builder({
    color: options.color ?? options.accentColor,
    spoiler: options.spoiler,
    safeMentions: options.safeMentions,
  });

  const headerLines = [];
  if (options.title) headerLines.push(formatHeadingIfPlain(options.title, options.headingLevel ?? 3));
  if (options.subtitle) headerLines.push(String(options.subtitle).trim());

  const hasHeaderThumbnail = options.thumbnail !== undefined && options.thumbnail !== null;
  const hasHeaderButton = Boolean(options.headerButton);

  if (headerLines.length > 0) {
    if (hasHeaderThumbnail || hasHeaderButton) {
      builder.addSection(headerLines, {
        thumbnail: options.thumbnail,
        thumbnailDescription: options.thumbnailDescription,
        thumbnailSpoiler: options.thumbnailSpoiler,
        button: options.headerButton,
        fallbackToText: true,
      });
    } else {
      builder.addText(headerLines.join("\n"));
    }
  }

  if (options.description) {
    if (headerLines.length > 0 && options.headerSeparator !== false) {
      builder.addSeparator(options.separatorSpacing || "small");
    }
    if (options.overflow) {
      builder.addSmartText(options.description, {
        overflow: options.overflow,
        filename: options.overflowFilename || "content.txt",
        maxLength: options.maxDescriptionLength,
        ignoreEmpty: true,
      });
    } else {
      builder.addText(options.description, {
        ignoreEmpty: true,
        maxLength: options.maxDescriptionLength,
      });
    }
  }

  if (Array.isArray(options.fields) && options.fields.length > 0) {
    if ((headerLines.length > 0 || options.description) && options.fieldsSeparator !== false) {
      builder.addSeparator(options.separatorSpacing || "small");
    }
    builder.addFields(options.fields, {
      omitIfEmpty: options.omitEmptyFields !== false,
      fallback: options.fieldFallback,
    });
  }

  if (Array.isArray(options.sections)) {
    for (const sec of options.sections) {
      if (!sec) continue;
      if (Array.isArray(sec.rows) || Array.isArray(sec.fields)) {
        builder.addSectionBlock(sec.heading || sec.title || "", sec.rows || sec.fields, {
          separator: sec.separator !== undefined ? sec.separator : true,
          omitIfEmpty: sec.omitIfEmpty !== false,
          fallback: sec.fallback,
        });
      } else if (sec.text) {
        if (sec.separator !== false) builder.addSeparator(options.separatorSpacing || "small");
        builder.addText(sec.text, { ignoreEmpty: true });
      }
    }
  }

  const gallery = options.gallery ?? options.image;
  if (gallery) {
    if (options.gallerySeparator !== false && (headerLines.length > 0 || options.description || options.fields?.length)) {
      builder.addSpacer(options.separatorSpacing || "small");
    }
    builder.addGallery(gallery, { ignoreEmpty: true, ignoreInvalid: options.ignoreInvalidMedia !== false });
  }

  if (Array.isArray(options.files)) {
    for (const file of options.files) {
      if (!file) continue;
      if (typeof file === "string" || Buffer.isBuffer(file)) {
        builder.addFile(file);
      } else if (file.source !== undefined) {
        builder.addFile(file.source, {
          name: file.name,
          description: file.description,
          spoiler: file.spoiler,
        });
      }
    }
  }

  if (options.footer) {
    if (options.footerSeparator !== false) {
      builder.addSpacer("small");
    }
    builder.addText(formatSubtextIfPlain(options.footer), { ignoreEmpty: true });
  }

  if (Array.isArray(options.buttons) && options.buttons.length > 0) {
    if (options.buttonSpacer !== false) {
      builder.addSpacer("small");
    }
    builder.addButtonsRow(options.buttons, { autoWrap: true });
  }

  if (Array.isArray(options.outsideButtons) && options.outsideButtons.length > 0) {
    builder.outside().addButtonsRow(options.outsideButtons, { autoWrap: true }).inside();
  }

  return builder;
}
exports.createCard = createCard;

/**
 * Builds an agnostic media/image showcase card with optional links and footer.
 */
function createImageView(options = {}) {
  const Builder = getBuilder();
  const builder = new Builder({
    color: options.color ?? options.accentColor,
    spoiler: options.spoiler,
    safeMentions: options.safeMentions,
  });

  const headerLines = [];
  if (options.title) headerLines.push(formatHeadingIfPlain(options.title, options.headingLevel ?? 3));
  if (options.subtitle) headerLines.push(String(options.subtitle).trim());
  if (headerLines.length > 0) {
    builder.addText(headerLines.join("\n"));
  }

  if (options.description) {
    builder.addText(options.description, { ignoreEmpty: true });
  }

  const media = options.images ?? options.gallery ?? options.image ?? options.url;
  if (media) {
    if (headerLines.length > 0 || options.description) {
      builder.addSpacer("small");
    }
    builder.addGallery(media, {
      description: options.imageDescription,
      spoiler: options.imageSpoiler,
      ignoreEmpty: true,
      ignoreInvalid: options.ignoreInvalidMedia !== false,
    });
  }

  const buttons = [];
  if (Array.isArray(options.links)) {
    for (const link of options.links) {
      if (!link?.url) continue;
      buttons.push({
        label: link.label || "Abrir enlace",
        style: link.style || "link",
        url: link.url,
        emoji: link.emoji,
        disabled: link.disabled,
      });
    }
  }
  if (Array.isArray(options.buttons)) {
    buttons.push(...options.buttons);
  }

  if (buttons.length > 0) {
    builder.addSpacer("small");
    builder.addButtonsRow(buttons, { autoWrap: true });
  }

  if (options.footer) {
    builder.addSpacer("small");
    builder.addText(formatSubtextIfPlain(options.footer), { ignoreEmpty: true });
  }

  if (Array.isArray(options.outsideButtons) && options.outsideButtons.length > 0) {
    builder.outside().addButtonsRow(options.outsideButtons, { autoWrap: true }).inside();
  }

  return builder;
}
exports.createImageView = createImageView;

/**
 * Builds an agnostic structured list card with page metadata and optional buttons.
 */
function createList(options = {}) {
  const Builder = getBuilder();
  const builder = new Builder({
    color: options.color ?? options.accentColor,
    spoiler: options.spoiler,
    safeMentions: options.safeMentions,
  });

  if (options.title || options.subtitle) {
    const header = [];
    if (options.title) header.push(formatHeadingIfPlain(options.title, options.headingLevel ?? 3));
    if (options.subtitle) header.push(String(options.subtitle).trim());
    if (options.thumbnail) {
      builder.addSection(header, { thumbnail: options.thumbnail, fallbackToText: true });
    } else {
      builder.addText(header.join("\n"));
    }
    builder.addSeparator("small");
  }

  const rawItems = Array.isArray(options.items) ? options.items : [];
  if (rawItems.length === 0) {
    builder.addText(options.emptyText || "-# Sin elementos para mostrar.", { ignoreEmpty: true });
  } else {
    const startIndex = Math.max(0, Number(options.startIndex) || 0);
    const numbered = Boolean(options.numbered);
    const renderItem =
      typeof options.renderItem === "function"
        ? options.renderItem
        : (item, idx) => {
            const text =
              typeof item === "string"
                ? item
                : item && typeof item === "object"
                ? item.line ?? `${item.label ? `**${item.label}:** ` : ""}${item.value ?? item.name ?? ""}`
                : String(item ?? "");
            if (!text) return "";
            if (numbered) return `**${startIndex + idx + 1}.** ${text}`;
            return text.startsWith(">") || text.startsWith("-") ? text : `• ${text}`;
          };

    const lines = rawItems.map((item, idx) => renderItem(item, idx)).filter(Boolean);
    const body = lines.join(options.itemSeparator ?? "\n");
    builder.addSmartText(body || options.emptyText || "-# Sin elementos para mostrar.", {
      overflow: options.overflow || "clip",
      filename: options.overflowFilename || "list.txt",
    });
  }

  const footerParts = [];
  if (options.page !== undefined && options.totalPages !== undefined) {
    const pageNum = Math.max(1, Number(options.page) || 1);
    const totalNum = Math.max(1, Number(options.totalPages) || 1);
    const baseText =
      typeof options.pageFormatter === "function"
        ? options.pageFormatter(pageNum, totalNum, options.totalItems)
        : `Página ${pageNum}/${totalNum}${options.totalItems !== undefined ? ` • ${options.totalItems} elementos` : ""}`;
    if (baseText) footerParts.push(baseText);
  }
  if (options.footer) footerParts.push(String(options.footer).trim());

  if (footerParts.length > 0) {
    builder.addSpacer("small");
    builder.addText(formatSubtextIfPlain(footerParts.join(" • ")));
  }

  if (Array.isArray(options.buttons) && options.buttons.length > 0) {
    builder.addSpacer("small");
    builder.addButtonsRow(options.buttons, { autoWrap: true });
  }

  if (Array.isArray(options.outsideButtons) && options.outsideButtons.length > 0) {
    builder.outside().addButtonsRow(options.outsideButtons, { autoWrap: true }).inside();
  }

  return builder;
}
exports.createList = createList;

/**
 * Confirmation prompt builder.
 * Supports both legacy positional arguments `(confirmId, cancelId, title?, message?)`
 * and an options object `{ title, message, description, confirmId, cancelId, ... }`.
 */
function createConfirm(confirmIdOrOptions, cancelId, title = "Confirmation Required", message = "Are you sure you want to proceed? This action cannot be undone.") {
  const Builder = getBuilder();

  if (confirmIdOrOptions && typeof confirmIdOrOptions === "object") {
    const opts = confirmIdOrOptions;
    const builder = new Builder({
      color: opts.color ?? opts.accentColor,
      spoiler: opts.spoiler,
      safeMentions: opts.safeMentions,
    });

    const heading = opts.title !== undefined ? formatHeadingIfPlain(opts.title, opts.headingLevel ?? 3) : "### Confirmation Required";
    const body = opts.message ?? opts.description ?? "Are you sure you want to proceed?";

    if (heading) builder.addText(heading);
    if (body) builder.addText(body);
    if (opts.warning) {
      builder.addText(V2Text.quote(opts.warning));
    }

    builder.addSeparator("small");
    builder.addButtonsRow([
      {
        label: opts.confirmLabel || "Confirm",
        customId: opts.confirmId || generateCustomId("confirm"),
        style: opts.confirmStyle || "success",
        emoji: opts.confirmEmoji,
        disabled: opts.disabled,
      },
      {
        label: opts.cancelLabel || "Cancel",
        customId: opts.cancelId || generateCustomId("cancel"),
        style: opts.cancelStyle || "danger",
        emoji: opts.cancelEmoji,
        disabled: opts.disabled,
      },
    ]);

    if (Array.isArray(opts.outsideButtons) && opts.outsideButtons.length > 0) {
      builder.outside().addButtonsRow(opts.outsideButtons, { autoWrap: true }).inside();
    }

    return builder;
  }

  return new Builder()
    .addText(`## ${title}`)
    .addText(message)
    .addSeparator("small")
    .addButtons([
      ["Confirm", confirmIdOrOptions, "success"],
      ["Cancel", cancelId, "danger"],
    ]);
}
exports.createConfirm = createConfirm;

/**
 * Legacy helper: creates a ticket creation prompt with a select menu.
 */
function createTicketMenu(customId, title = "Support Tickets", description = "Select the category that best matches your issue.") {
  const Builder = getBuilder();
  const builder = new Builder().addText(`# ${title}`).addText(description).addSeparator("small");
  const select = builder.addSelectMenu(customId, "Select a ticket category");
  return { builder, select };
}
exports.createTicketMenu = createTicketMenu;

/**
 * Legacy helper: creates a subscription plan selector menu.
 */
function createPlanSelector(customId, title = "Select Your Plan", description = "Choose a subscription tier below.") {
  const Builder = getBuilder();
  const builder = new Builder().addText(`# ${title}`).addText(description).addSeparator("small");
  const select = builder.addSelectMenu(customId, "Choose a plan");
  return { builder, select };
}
exports.createPlanSelector = createPlanSelector;

/**
 * Legacy helper: creates a role selection menu.
 */
function createRoleMenu(customId, title = "Self-Assignable Roles", description = "Pick roles from the dropdown below.") {
  const Builder = getBuilder();
  const builder = new Builder().addText(`# ${title}`).addText(description).addSeparator("small");
  const select = builder.addSelectMenu(customId, "Select roles");
  return { builder, select };
}
exports.createRoleMenu = createRoleMenu;
