const mongoose = require("mongoose");
const { MessageFlags } = require("discord.js");
const { ComponentsV2Builder, V2Paginator, V2Text } = require("gralonium");
const { ImageHistory } = require("./database");
const { RED } = require("./config");
const { fetchPublic, readBodyLimited } = require("./security");

const MAX_HISTORY_PER_TARGET = 15;
const MAX_BACKUP_BYTES = 250 * 1024;
const ALLOWED_BACKUP_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function extractImageHash(url) {
  if (!url) return "";
  const clean = String(url).split("?")[0];
  const lastSegment = clean.split("/").pop() ?? clean;
  return lastSegment.replace(/\.[a-z0-9]+$/i, "") || clean;
}

function buildCompactUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has("size")) {
      parsed.searchParams.set("size", "256");
    } else if (/cdn\.discordapp\.(com|net)$/i.test(parsed.hostname)) {
      parsed.searchParams.set("size", "256");
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

async function downloadBackupImage(url) {
  try {
    const res = await fetchPublic(buildCompactUrl(url), {}, 6000);
    if (!res?.ok) return null;
    const body = await readBodyLimited(res, MAX_BACKUP_BYTES);
    if (body.tooLarge || !body.buffer?.length) return null;
    const mimeType = (res.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_BACKUP_MIMES.has(mimeType)) return null;
    return { imageData: body.buffer, mimeType };
  } catch {
    return null;
  }
}

const recordingInFlight = new Set();

function extractImageBuffer(raw) {
  if (!raw) return null;
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw.value === "function") return Buffer.from(raw.value(true));
  if (raw.buffer) {
    const len = typeof raw.position === "number" ? raw.position : raw.buffer.length;
    return Buffer.from(raw.buffer.subarray(0, len));
  }
  return null;
}

async function recordImageIfNew(targetType, targetId, url) {
  if (!targetType || !targetId || !url || mongoose.connection.readyState !== 1) return false;

  const hash = extractImageHash(url);
  if (!hash) return false;

  const lockKey = `${targetType}:${targetId}:${hash}`;
  if (recordingInFlight.has(lockKey)) return false;
  recordingInFlight.add(lockKey);

  try {
    const latest = await ImageHistory.findOne({ targetType, targetId })
      .sort({ createdAt: -1 })
      .select("hash")
      .lean();

    if (latest?.hash === hash) return false;

    const backup = await downloadBackupImage(url).catch(() => null);
    await ImageHistory.create({
      targetType,
      targetId,
      url,
      hash,
      ...(backup ? backup : {}),
    });

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
  } finally {
    recordingInFlight.delete(lockKey);
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
    isEphemeral: true,
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
      const buf = extractImageBuffer(entry.imageData);
      const extMap = { "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/png": "png" };
      const ext = extMap[entry.mimeType] || "png";
      const fileName = `history-${pageIndex + 1}.${ext}`;

      const builder = new ComponentsV2Builder({ color })
        .addText(
          `${V2Text.heading(title, 3, 200)}\n` +
          `${V2Text.subtext(`Imagen ${pageIndex + 1}/${totalPages} · <t:${ts}:F> (<t:${ts}:R>)`)}`
        );

      if (buf?.length) {
        builder.addAttachment(buf, { name: fileName }).addGallery(`attachment://${fileName}`);
      } else {
        builder.addGallery(entry.url);
      }

      builder.addSpacer("small");

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
  const replyResult = await interaction.reply({ ...payload, withResponse: true }).catch(() => null);

  const msg = replyResult?.resource?.message ?? replyResult;
  if (items.length > 1 && msg && typeof msg.createMessageComponentCollector === "function") {
    paginator.attach(msg);
  }
  return false;
}

module.exports = {
  recordImageIfNew,
  replyWithImageHistory,
};
