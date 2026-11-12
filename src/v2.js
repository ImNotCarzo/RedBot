const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require("discord.js");
const { RED } = require("./config");
const { buildPaginationRow } = require("./runtime");

const V2_MAX_MESSAGE_TEXT = 3950;

function resolveAccentColor(color, fallback = RED) {
  if (typeof color === "number" && Number.isInteger(color) && color >= 0 && color <= 0xffffff) {
    return color;
  }
  if (typeof color === "string") {
    const cleaned = color.trim().replace(/^#/, "");
    if (/^[0-9a-f]{6}$/i.test(cleaned)) {
      return Number.parseInt(cleaned, 16);
    }
  }
  if (color !== fallback) return resolveAccentColor(fallback, 0xff383d);
  return 0xff383d;
}

function isValidMediaUrl(url) {
  return typeof url === "string" && /^(https?:|attachment:)\/\//i.test(url.trim());
}

function clipV2Text(text, maxLen = V2_MAX_MESSAGE_TEXT, fallback = "-") {
  const str = String(text ?? "").trim();
  if (!str) return fallback;
  if (str.length <= maxLen) return str;
  if (maxLen <= 1) return str.slice(0, maxLen);
  return `${str.slice(0, maxLen - 1)}…`;
}

function budgetBodyText(body, reservedChars = 0, maxTotal = V2_MAX_MESSAGE_TEXT, fallback = "-") {
  const remaining = Math.max(32, maxTotal - Math.max(0, reservedChars));
  return clipV2Text(body, remaining, fallback);
}

function createContainer(color = RED) {
  return new ContainerBuilder().setAccentColor(resolveAccentColor(color));
}

function addSeparator(container, spacing = SeparatorSpacingSize.Small, divider = true) {
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(spacing).setDivider(divider)
  );
  return container;
}

function addTextBlock(container, content, maxLen = V2_MAX_MESSAGE_TEXT) {
  const safe = clipV2Text(content, maxLen, "");
  if (!safe) return container;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(safe));
  return container;
}

function addHeaderSection(container, texts, thumbnailUrl = null) {
  const list = (Array.isArray(texts) ? texts : [texts])
    .map((t) => String(t ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!list.length) return container;

  if (isValidMediaUrl(thumbnailUrl)) {
    const section = new SectionBuilder().setThumbnailAccessory(
      new ThumbnailBuilder().setURL(thumbnailUrl.trim())
    );
    for (const entry of list) {
      section.addTextDisplayComponents(new TextDisplayBuilder().setContent(clipV2Text(entry, V2_MAX_MESSAGE_TEXT)));
    }
    container.addSectionComponents(section);
  } else {
    for (const entry of list) {
      addTextBlock(container, entry);
    }
  }
  return container;
}

function addMediaImage(container, url, description = null) {
  if (!isValidMediaUrl(url)) return container;
  const item = new MediaGalleryItemBuilder().setURL(url.trim());
  if (description) item.setDescription(clipV2Text(description, 1024));
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(item));
  return container;
}

function addLinkButtons(container, links = []) {
  const valid = links.filter((l) => l?.label && isValidMediaUrl(l.url)).slice(0, 5);
  if (!valid.length) return container;
  const row = new ActionRowBuilder().addComponents(
    valid.map((l) =>
      new ButtonBuilder()
        .setLabel(String(l.label).slice(0, 80))
        .setStyle(ButtonStyle.Link)
        .setURL(l.url.trim())
    )
  );
  container.addActionRowComponents(row);
  return container;
}

function addAttachmentFile(container, buffer, fileName) {
  const attachment = new AttachmentBuilder(buffer, { name: fileName });
  container.addFileComponents(new FileBuilder().setURL(`attachment://${fileName}`));
  return attachment;
}

function buildV2Payload(containers, { files = [], ephemeral = false, allowMentions = false } = {}) {
  const list = Array.isArray(containers) ? containers : [containers];
  const flags = ephemeral
    ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    : MessageFlags.IsComponentsV2;

  const payload = {
    flags,
    components: list,
    allowedMentions: allowMentions
      ? { repliedUser: false }
      : { parse: [], repliedUser: false },
  };

  if (files?.length) payload.files = files;
  return payload;
}

/**
 * Construye una tarjeta estándar con título, bloque opcional con thumbnail, cuerpo y pie.
 */
function buildSimpleContainer({
  title = null,
  subtitle = null,
  body = null,
  footer = null,
  thumbnailUrl = null,
  color = RED,
  links = [],
  dividerBeforeBody = true,
} = {}) {
  const container = createContainer(color);
  const safeTitle = title ? `### ${clipV2Text(title, 200)}` : null;
  const safeSub = subtitle ? `-# ${clipV2Text(subtitle, 200)}` : null;
  const safeFooter = footer ? `-# ${clipV2Text(footer, 200)}` : null;

  const reserved = (safeTitle?.length ?? 0) + (safeSub?.length ?? 0) + (safeFooter?.length ?? 0) + 16;

  if (safeTitle || safeSub) {
    const headerLines = [safeTitle, safeSub].filter(Boolean);
    addHeaderSection(container, headerLines, thumbnailUrl);
    if (body) addSeparator(container, SeparatorSpacingSize.Small, dividerBeforeBody);
  } else if (isValidMediaUrl(thumbnailUrl) && body) {
    addHeaderSection(container, [budgetBodyText(body, reserved)], thumbnailUrl);
    body = null;
  }

  if (body) {
    addTextBlock(container, budgetBodyText(body, reserved));
  }

  if (safeFooter) {
    addTextBlock(container, safeFooter, 210);
  }

  if (links?.length) {
    addSeparator(container, SeparatorSpacingSize.Small, false);
    addLinkButtons(container, links);
  }

  return container;
}

/**
 * Construye una tarjeta centrada en una imagen (avatar, banner, logo, icono, emoji).
 */
function buildImageViewContainer({
  authorName = null,
  title,
  imageUrl,
  footer = null,
  color = RED,
  linkLabel = "Abrir imagen",
  extraRows = [],
} = {}) {
  const container = createContainer(color);
  const lines = [];
  if (authorName) lines.push(`-# ${clipV2Text(authorName, 120)}`);
  if (title) lines.push(`### ${clipV2Text(title, 200)}`);

  addTextBlock(container, lines.join("\n"));
  addMediaImage(container, imageUrl);

  if (footer) {
    addTextBlock(container, `-# ${clipV2Text(footer, 200)}`, 210);
  }

  addSeparator(container, SeparatorSpacingSize.Small, false);
  addLinkButtons(container, [{ label: linkLabel, url: imageUrl }]);
  for (const row of extraRows) {
    if (row) container.addActionRowComponents(row);
  }

  return container;
}

/**
 * Construye una tarjeta paginada con controles opcionales embebidos dentro del contenedor.
 */
function buildPaginatedListContainer({
  title,
  subtitle = null,
  lines = [],
  footer = null,
  thumbnailUrl = null,
  color = RED,
  page = 0,
  totalPages = 1,
  prevId = null,
  nextId = null,
  extraRows = [],
  interactive = true,
} = {}) {
  const container = createContainer(color);
  const headerLines = [`### ${clipV2Text(title, 200)}`];
  if (subtitle) headerLines.push(`-# ${clipV2Text(subtitle, 200)}`);

  addHeaderSection(container, headerLines, thumbnailUrl);
  addSeparator(container);

  const safeFooter = footer ? `-# ${clipV2Text(footer, 200)}` : null;
  const reserved = headerLines.join("\n").length + (safeFooter?.length ?? 0) + 16;
  addTextBlock(container, budgetBodyText(lines.join("\n"), reserved));

  if (safeFooter) {
    addTextBlock(container, safeFooter, 210);
  }

  if (interactive) {
    const hasRows = extraRows.some(Boolean) || (totalPages > 1 && prevId && nextId);
    if (hasRows) addSeparator(container, SeparatorSpacingSize.Small, false);
    for (const row of extraRows) {
      if (row) container.addActionRowComponents(row);
    }
    if (totalPages > 1 && prevId && nextId) {
      container.addActionRowComponents(buildPaginationRow(prevId, nextId, page, totalPages));
    }
  }

  return container;
}

module.exports = {
  V2_MAX_MESSAGE_TEXT,
  resolveAccentColor,
  isValidMediaUrl,
  clipV2Text,
  budgetBodyText,
  createContainer,
  addSeparator,
  addTextBlock,
  addHeaderSection,
  addMediaImage,
  addLinkButtons,
  addAttachmentFile,
  buildV2Payload,
  buildSimpleContainer,
  buildImageViewContainer,
  buildPaginatedListContainer,
};
