const Logger = require("../src/core/logger");
const { getLogChannelId, cleanupBrokenLogChannel } = require("../src/services/guildLog.service");

const log = new Logger("SEND_LOG", process.env.LOG_LEVEL);

async function sendLog(guild, embed) {
  try {
    if (!guild?.id || !embed) return;
    const channelId = await getLogChannelId(guild.id);
    if (!channelId) return;
    const ch = guild.channels.cache.get(channelId);
    if (!ch) {
      await cleanupBrokenLogChannel(guild.id).catch(() => {});
      return;
    }
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (err) {
    log.error("Error enviando log de moderación", {
      guildId: guild?.id,
      err: err?.message ?? String(err),
    });
  }
}

module.exports = sendLog;
