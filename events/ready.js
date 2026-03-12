const { ActivityType } = require("discord.js");
const TempBan = require("../models/TempBan");
const { scheduleTempUnban } = require("../utils/helpers");

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

let presenceInterval = null;

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

    if (presenceInterval) clearInterval(presenceInterval);

    let i = 0;
    presenceInterval = setInterval(() => {
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