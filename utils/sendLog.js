const Log = require("../models/Log");

async function sendLog(guild, embed) {
  try {
    const doc = await Log.findOne({ guildId: guild.id });
    if (!doc) return;
    const ch = guild.channels.cache.get(doc.channelId);
    if (!ch) {
      await Log.deleteOne({ guildId: guild.id }).catch(() => {});
      return;
    }
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (err) {
    console.error("[sendLog] Error:", err?.message ?? err);
  }
}

module.exports = sendLog;
