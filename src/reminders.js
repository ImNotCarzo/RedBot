const { EmbedBuilder } = require("discord.js");
const { Reminder } = require("./database");
const { RED } = require("./config");
const { Logger } = require("./runtime");

const log = new Logger("REMINDER_SERVICE");
const timers = new Map();
const MAX_TIMEOUT_MS = 2147483647;
const MAX_PER_USER = 10;
const RETRY_MS = 60_000;

function clearTimer(id) {
  const existing = timers.get(id);
  if (existing) {
    clearTimeout(existing);
    timers.delete(id);
  }
}

function scheduleReminder(client, doc) {
  if (!client || !doc?._id) return;

  const id = String(doc._id);
  clearTimer(id);

  const when = new Date(doc.remindAt).getTime();
  if (Number.isNaN(when)) return;

  const delay = when - Date.now();
  if (delay <= 0) {
    deliverReminder(client, doc);
    return;
  }

  const timer = setTimeout(() => {
    timers.delete(id);
    if (delay > MAX_TIMEOUT_MS) scheduleReminder(client, doc);
    else deliverReminder(client, doc);
  }, Math.min(delay, MAX_TIMEOUT_MS));
  timer.unref();
  timers.set(id, timer);
}

async function deliverReminder(client, doc) {
  const id = String(doc._id);
  try {
    const pending = await Reminder.exists({ _id: doc._id });
    if (!pending) return;

    const embed = new EmbedBuilder()
      .setTitle("Recordatorio")
      .setDescription(doc.text)
      .setColor(RED)
      .setTimestamp(doc.createdAt ? new Date(doc.createdAt) : new Date());

    let sent = false;

    const user = await client.users.fetch(doc.userId).catch(() => null);
    if (user) {
      sent = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
    }

    if (!sent && doc.channelId) {
      const channel = await client.channels.fetch(doc.channelId).catch(() => null);
      if (channel?.isTextBased?.()) {
        sent = await channel
          .send({
            content: `<@${doc.userId}>`,
            embeds: [embed],
            allowedMentions: { users: [doc.userId] },
          })
          .then(() => true)
          .catch(() => false);
      }
    }

    if (!sent) log.warn("No se pudo entregar el recordatorio", { reminderId: id, userId: doc.userId });
    await Reminder.deleteOne({ _id: doc._id });
  } catch (err) {
    log.error("Fallo al entregar recordatorio; reintentando", { reminderId: id, err: err?.message ?? String(err) });
    scheduleReminder(client, { ...doc, remindAt: new Date(Date.now() + RETRY_MS) });
  }
}

async function createReminder(client, { userId, guildId = null, channelId = null, text, remindAt }) {
  const count = await Reminder.countDocuments({ userId });
  if (count >= MAX_PER_USER) return { error: "limit", max: MAX_PER_USER };

  const created = await Reminder.create({ userId, guildId, channelId, text, remindAt });
  const doc = created.toObject();
  scheduleReminder(client, doc);
  return { reminder: doc };
}

async function restoreReminders(client) {
  try {
    const pending = await Reminder.find({}).lean();
    for (const doc of pending) scheduleReminder(client, doc);
    if (pending.length) log.info(`Recordatorios restaurados: ${pending.length}`);
  } catch (err) {
    log.error("Error al restaurar recordatorios", { err: err?.message ?? String(err) });
  }
}

module.exports = { createReminder, restoreReminders, scheduleReminder, MAX_PER_USER };
