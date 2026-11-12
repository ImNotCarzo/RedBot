const mongoose = require("mongoose");
const { MessageFlags } = require("discord.js");
const { ComponentsV2Builder, V2Paginator, V2Text } = require("gralonium");
const { ImageHistory } = require("./database");
const { RED } = require("./config");

const MAX_HISTORY_PER_TARGET = 15;

function extractImageHash(url) {
  if (!url) return "";
  const clean = String(url).split("?")[0];
  const lastSegment = clean.split("/").pop() ?? clean;
  return lastSegment.replace(/\.[a-z0-9]+$/i, "") || clean;
}

async function recordImageIfNew(targetType, targetId, url) {
  if (!targetType || !targetId || !url || mongoose.connection.readyState !== 1) return false;

  const hash = extractImageHash(url);
  if (!hash) return false;

  try {
    const latest = await ImageHistory.findOne({ targetType, targetId })
      .sort({ createdAt: -1 })
      .select("hash")
      .lean();

    if (latest?.hash === hash) return false;

    await ImageHistory.create({ targetType, targetId, url, hash });

    const overflow = await ImageHistory.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .skip(MAX_HISTORY_PER_TARGET)
      .select("_id")
      .lean();

    if (overflow.length) {
      await ImageHistory.deleteMany({ _id: { $in: overflow.map((d) => d._id) } });
    }
    return true;
  } catch {
    return false;
  }
}

async function getImageHistory(targetType, targetId, limit = MAX_HISTORY_PER_TARGET) {
  if (!targetType || !targetId || mongoose.connection.readyState !== 1) return [];
  try {
    return await ImageHistory.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch {
    return [];
  }
}

async function replyWithImageHistory(interaction, { targetType, targetId, title, color = RED }) {
  const items = await getImageHistory(targetType, targetId);
  if (!items.length) {
    await interaction
      .reply({ content: "No hay historial guardado todavía", flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return false;
  }

  const paginator = new V2Paginator({
    items,
    perPage: 1,
    ownerId: interaction.user?.id,
    thirdPartyMode: "ephemeral-view",
    thirdPartyMessage: "No es tu comando",
    wrap: false,
    prevButton: { label: "◀" },
    nextButton: { label: "▶" },
    showPageIndicator: false,
    timeout: 2 * 60_000,
    renderPage: ({ items: pageItems, pageIndex, totalPages, isEnded, controls }) => {
      const entry = pageItems[0];
      const ts = Math.floor(new Date(entry.createdAt ?? Date.now()).getTime() / 1000);
      const builder = new ComponentsV2Builder({ color })
        .addText(
          `${V2Text.heading(title, 3, 200)}\n` +
          `${V2Text.subtext(`Imagen ${pageIndex + 1}/${totalPages} · <t:${ts}:F> (<t:${ts}:R>)`)}`
        )
        .addGallery(entry.url)
        .addSpacer("small");

      const rowButtons = [];
      if (!isEnded && totalPages > 1 && controls?.length) {
        rowButtons.push(...controls);
      }
      rowButtons.push({ label: "Abrir imagen", style: "link", url: entry.url });
      builder.addButtonsRow(rowButtons);

      return builder;
    },
  });

  const payload = paginator.toPayload({ ephemeral: true });
  let replyResult = null;
  try {
    replyResult = await interaction.reply({ ...payload, withResponse: true });
  } catch {
    replyResult = await interaction.reply(payload).catch(() => null);
  }

  const msg = replyResult?.resource?.message ?? replyResult;
  if (items.length > 1 && msg && typeof msg.createMessageComponentCollector === "function") {
    paginator.attach(msg);
  }
  return false;
}

module.exports = {
  extractImageHash,
  recordImageIfNew,
  getImageHistory,
  replyWithImageHistory,
};
