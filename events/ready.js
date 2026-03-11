const { ActivityType } = require("discord.js");
const { scheduleTempUnban, TempBan } = require("../commands/mod");

async function restoreTempBans(client) {
  try {
    const pending = await TempBan.find({});
    if (!pending.length) return;

    console.log(`[TempBan] Restaurando ${pending.length} tempban(s)...`);
    for (const entry of pending) {
      scheduleTempUnban(client, entry.guildId, entry.userId, entry.unbanAt);
    }
    console.log("[TempBan] Tempbans restaurados.");
  } catch (err) {
    console.error("[TempBan] Error al restaurar tempbans:", err);
  }
}

const event = {
  name: "clientReady",
  async code(bot) {
    console.log(`${bot.user.username} ready`);

    await restoreTempBans(bot);

    const getActivities = () => [
      `${bot.guilds.cache.size} servidores`,
      `${bot.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)} usuarios`,
      "/help",
    ];

    let i = 0;
    setInterval(() => {
      const activities = getActivities();
      bot.user.setPresence({
        activities: [{ name: activities[i], type: ActivityType.Watching }],
        status: "dnd",
      });
      i = (i + 1) % activities.length;
    }, 10000);
  },
};

module.exports = { data: event };