const { MessageFlags } = require("discord.js");
const { ComponentsV2Builder, V2Text } = require("gralonium");
const { DARK, RED } = require("../config");
const { getCurrentLang, translatePayload } = require("../i18n");
const { createListPaginator } = require("../runtime");

const THIRD_PARTY_MESSAGE = "No es tu comando";
const INTERACTION_I18N_WRAPPED = Symbol.for("redbot.interactionI18nWrapped");

async function replyInteractionEphemeral(interaction, payload) {
  const isBuilder = typeof payload?.toPayload === "function";
  const raw = typeof payload === "string"
    ? { content: payload, flags: MessageFlags.Ephemeral }
    : isBuilder
      ? payload.toPayload({ ephemeral: true })
      : { ...payload, flags: MessageFlags.Ephemeral };
  const data = isBuilder || interaction?.[INTERACTION_I18N_WRAPPED]
    ? raw
    : translatePayload(raw, getCurrentLang());

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(data).catch(() => interaction.followUp(data).catch(() => null));
  }
  return interaction.reply(data).catch(() => null);
}

function createStandardListPaginator({ items, perPage = 15, ownerId, title, subtitle = null, color = RED, timeout = 2 * 60_000 }) {
  return createListPaginator({
    items,
    perPage,
    ownerId,
    timeout,
    render: ({ items: pageItems, pageIndex, totalPages, controls }) => {
      const ctxInfo = { pageIndex, totalPages, total: items.length };
      const titleText = typeof title === "function" ? title(ctxInfo) : title;
      const subText = typeof subtitle === "function" ? subtitle(ctxInfo) : subtitle;
      const header = subText
        ? `${V2Text.heading(titleText, 3, 200)}\n${V2Text.subtext(subText, 200)}`
        : V2Text.heading(titleText, 3, 200);
      const b = new ComponentsV2Builder({ color })
        .addText(header)
        .addSeparator("small")
        .addText(pageItems.join("\n"))
        .addText(V2Text.subtext(`Página ${pageIndex + 1}/${totalPages} · ${items.length} en total`, 200));
      if (controls) b.addSpacer("small").addButtonsRow(controls);
      return b;
    },
  });
}

function slicePage(items, pageIndex = 0, perPage = 15) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.max(0, Math.min(totalPages - 1, pageIndex));
  const start = safePage * perPage;
  return { pageIndex: safePage, totalPages, start, items: items.slice(start, start + perPage) };
}

function buildListCard({ title, subtitle = null, lines, footer = null, thumbnail = null, color = DARK, controls = null }) {
  const headerLines = [V2Text.heading(title, 3, 200)];
  if (subtitle) headerLines.push(V2Text.subtext(subtitle, 200));

  const builder = new ComponentsV2Builder({ color })
    .addSection(headerLines, { thumbnail, fallbackToText: true })
    .addSeparator("small")
    .addText(V2Text.clip(lines.join("\n"), 3600));

  if (footer) builder.addText(V2Text.subtext(footer, 200));
  if (controls?.length) builder.addSpacer("small").addButtonsRow(controls);
  return builder;
}

function buildImageCard({ title, subtitle = null, imageUrl, color = RED, historyButtonId = null } = {}) {
  const header = subtitle
    ? `${V2Text.subtext(subtitle, 120)}\n${V2Text.heading(title, 3, 200)}`
    : V2Text.heading(title, 3, 200);

  const builder = new ComponentsV2Builder({ color })
    .addText(header)
    .addGallery(imageUrl)
    .addSpacer("small");

  if (historyButtonId) {
    return builder.addButtonsRow([
      { label: "Abrir imagen", style: "link", url: imageUrl },
      { customId: historyButtonId, label: "Historial", style: "secondary" },
    ]);
  }
  return builder.addButton({ label: "Abrir imagen", style: "link", url: imageUrl });
}

module.exports = {
  THIRD_PARTY_MESSAGE,
  replyInteractionEphemeral,
  createStandardListPaginator,
  slicePage,
  buildListCard,
  buildImageCard,
};
