const Logger = require("../core/logger");
const { getLogChannelId, cleanupBrokenLogChannel } = require("./guildLog.service");

const log = new Logger("GUILD_LOG", process.env.LOG_LEVEL);

async function sendLog(guild, embed, context = {}) {
  try {
    if (!guild?.id || !embed) return false;
    const channelId = await getLogChannelId(guild.id);
    if (!channelId) return false;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      await cleanupBrokenLogChannel(guild.id).catch(() => {});
      return false;
    }

    if (!channel.isTextBased()) return false;
    await channel.send({ embeds: [embed] });
    return true;
  } catch (err) {
    log.error("Error enviando log de guild", {
      guildId: guild?.id,
      action: context?.action,
      userId: context?.userId,
      err: err?.message ?? String(err),
    });
    return false;
  }
}

module.exports = sendLog;
