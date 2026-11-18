const mongoose = require("mongoose");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { Reminder } = require("./database");
const { RED } = require("./config");
const { Logger, sanitizeError } = require("./runtime");

const log = new Logger("REMINDER_SERVICE");
const timers = new Map();
const MAX_TIMEOUT_MS = 2147483647;
const MAX_PER_USER = 10;
const RETRY_MS = 60_000;
const MAX_DELIVERY_RETRIES = 3;

function clearTimer(id) {
  const existing = timers.get(id);
  if (existing) {
    clearTimeout(existing);
    timers.delete(id);
  }
}

function stopReminderTimers() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

function scheduleReminder(client, doc, attempt = 0) {
  if (!client || !doc?._id) return;

  const id = String(doc._id);
  clearTimer(id);

  const when = new Date(doc.remindAt).getTime();
  if (Number.isNaN(when)) return;

  const delay = when - Date.now();
  if (delay <= 0) {
    deliverReminder(client, doc, attempt);
    return;
  }

  const timer = setTimeout(() => {
    timers.delete(id);
    if (delay > MAX_TIMEOUT_MS) scheduleReminder(client, doc, attempt);
    else deliverReminder(client, doc, attempt);
  }, Math.min(delay, MAX_TIMEOUT_MS));
  timer.unref();
  timers.set(id, timer);
}

function buildSnoozeRow(userId, lang = "es", disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rem_snooze:${userId}:15m`)
      .setLabel(lang === "en" ? "Snooze +15 min" : "Posponer +15 min")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`rem_snooze:${userId}:1h`)
      .setLabel(lang === "en" ? "Snooze +1 hour" : "Posponer +1 hora")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

async function deliverReminder(client, doc, attempt = 0) {
  const id = String(doc._id);
  if (Reminder.db?.readyState !== 1) {
    if (attempt < MAX_DELIVERY_RETRIES) {
      scheduleReminder(client, { ...doc, remindAt: new Date(Date.now() + RETRY_MS) }, attempt + 1);
    }
    return;
  }

  try {
    // Reclamo atómico antes de enviar para impedir doble entrega si falla un borrado posterior
    const claimed = await Reminder.findOneAndDelete({ _id: doc._id }).lean();
    if (!claimed) return;

    const lang = await require("./guild")
      .resolveContextLang({ guildId: claimed.guildId ?? null, userId: claimed.userId ?? null })
      .catch(() => "es");
    const embed = new EmbedBuilder()
      .setTitle(lang === "en" ? "Reminder" : "Recordatorio")
      .setDescription(claimed.text)
      .setColor(RED)
      .setTimestamp(claimed.createdAt ? new Date(claimed.createdAt) : new Date());

    const components = [buildSnoozeRow(claimed.userId, lang)];
    let sent = false;

    const user = await client.users.fetch(claimed.userId).catch(() => null);
    if (user) {
      sent = await user.send({ embeds: [embed], components }).then(() => true).catch(() => false);
    }

    if (!sent && claimed.channelId) {
      const channel = await client.channels.fetch(claimed.channelId).catch(() => null);
      if (channel?.isTextBased?.()) {
        sent = await channel
          .send({
            content: `<@${claimed.userId}>`,
            embeds: [embed],
            components,
            allowedMentions: { users: [claimed.userId] },
          })
          .then(() => true)
          .catch(() => false);
      }
    }

    if (!sent) log.warn("No se pudo entregar el recordatorio", { reminderId: id, userId: claimed.userId });
  } catch (err) {
    log.error("Fallo al entregar recordatorio", { reminderId: id, attempt, err: sanitizeError(err) });
    if (attempt < MAX_DELIVERY_RETRIES) {
      scheduleReminder(client, { ...doc, remindAt: new Date(Date.now() + RETRY_MS) }, attempt + 1);
    }
  }
}

async function createReminder(client, { userId, guildId = null, channelId = null, text, remindAt }) {
  if (Reminder.db?.readyState !== 1) return { error: "db" };
  const count = await Reminder.countDocuments({ userId });
  if (count >= MAX_PER_USER) return { error: "limit", max: MAX_PER_USER };

  const created = await Reminder.create({ userId, guildId, channelId, text, remindAt });
  const doc = created.toObject();
  scheduleReminder(client, doc);
  return { reminder: doc };
}

async function listUserReminders(userId) {
  if (!userId || Reminder.db?.readyState !== 1) return [];
  try {
    return await Reminder.find({ userId }).sort({ remindAt: 1 }).lean();
  } catch {
    return [];
  }
}

async function cancelReminder(userId, reminderId = null) {
  if (!userId || Reminder.db?.readyState !== 1) return { deleted: 0 };
  if (!reminderId || reminderId === "all") {
    const docs = await Reminder.find({ userId }).select("_id").lean();
    for (const d of docs) clearTimer(String(d._id));
    const res = await Reminder.deleteMany({ userId });
    return { deleted: res?.deletedCount ?? docs.length };
  }

  if (!mongoose.isValidObjectId(reminderId)) return { deleted: 0 };

  const removed = await Reminder.findOneAndDelete({ _id: reminderId, userId }).lean();
  if (!removed) return { deleted: 0 };
  clearTimer(String(removed._id));
  return { deleted: 1, reminder: removed };
}

async function restoreReminders(client) {
  if (Reminder.db?.readyState !== 1) return;
  try {
    const pending = await Reminder.find({}).lean();
    for (const doc of pending) scheduleReminder(client, doc);
    if (pending.length) log.info(`Recordatorios restaurados: ${pending.length}`);
  } catch (err) {
    log.error("Error al restaurar recordatorios", { err: sanitizeError(err) });
  }
}

module.exports = {
  createReminder,
  listUserReminders,
  cancelReminder,
  restoreReminders,
  stopReminderTimers,
  buildSnoozeRow,
};
