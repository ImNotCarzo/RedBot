const { Gralonium } = require("gralonium");
const botConfig = require("../config/bot.config");
const { getPrefix, DEFAULT_PREFIX } = require("../services/guildConfig.service");
const { loadAndRegisterEvents } = require("../handlers/eventHandler");
const { wrapPrefixedCommands } = require("../handlers/commandHandler");
const { registerReadyHandler } = require("../handlers/readyHandler");
const { registerMessageHandler } = require("../handlers/messageHandler");

function buildPrefixResolver() {
  return async (ctx) => {
    const message = ctx.data;
    if (!message?.content || message?.author?.bot) return null;

    const content = message.content;
    const guildId = message.guildId;
    const botId = message.client?.user?.id;

    if (botId) {
      const mentionA = `<@${botId}>`;
      const mentionB = `<@!${botId}>`;
      const onlyMention = content.trim() === mentionA || content.trim() === mentionB;
      if (onlyMention) {
        const guildPrefix = guildId ? await getPrefix(guildId) : DEFAULT_PREFIX;
        await message.reply({
          content: `Mi prefijo en este servidor es \`${guildPrefix}\``,
          allowedMentions: { repliedUser: false },
        }).catch(() => {});
        return null;
      }
      if (content.startsWith(mentionA)) return mentionA;
      if (content.startsWith(mentionB)) return mentionB;
    }

    if (!guildId) return content.startsWith(DEFAULT_PREFIX) ? DEFAULT_PREFIX : null;

    const prefix = await getPrefix(guildId);
    return content.startsWith(prefix) ? prefix : null;
  };
}

/**
 * Create the Gralonium bot instance.
 *
 * @returns {import("gralonium").Gralonium}
 */
function createBot() {
  const bot = new Gralonium({
    ...botConfig,
    prefix: buildPrefixResolver(),
  });

  bot.setMaxListeners(20);
  return bot;
}

/**
 * Initialise command/event runtime and login the bot.
 *
 * @param {import("gralonium").Gralonium} bot
 * @param {{ TOKEN: string, CLIENT_ID: string }} config
 * @param {import("./logger")} [log]
 * @returns {Promise<void>}
 */
async function initializeBot(bot, config, log) {
  await bot.load("commands");
  wrapPrefixedCommands(log);
  loadAndRegisterEvents(bot, log);
  registerReadyHandler(bot, config, log);
  registerMessageHandler(bot, log);
  const https = require("https");
https.get("https://discord.com/api/v10/gateway", (res) => {
  log.info("Discord alcanzable", { status: res.statusCode });
}).on("error", (e) => {
  log.error("No se puede alcanzar Discord", { err: e.message });
});
  await bot.login(config.TOKEN);
}

module.exports = { createBot, initializeBot };
