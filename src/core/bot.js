const { Gralonium } = require("gralonium");
const botConfig = require("../config/bot.config");
const GuildConfig = require("../../models/GuildConfig");
const prefixCache = require("../../utils/prefixCache");
const { loadAndRegisterEvents } = require("../handlers/eventHandler");
const { wrapPrefixedCommands } = require("../handlers/commandHandler");
const { registerReadyHandler } = require("../handlers/readyHandler");
const { registerMessageHandler } = require("../handlers/messageHandler");

/**
 * Create and fully initialise the Gralonium bot instance.
 *
 * @param {{ TOKEN: string, CLIENT_ID: string }} config - Validated env config.
 * @param {import("./logger")} log - Logger instance.
 * @returns {import("gralonium").Gralonium} The logged-in bot.
 */
function createBot(config, log) {
  const bot = new Gralonium({
    ...botConfig,
    prefix: async (ctx) => {
      const message = ctx.data;
      if (!message?.content || message?.author?.bot) return null;

      const content = message.content;
      const botId   = message.client?.user?.id;

      if (botId) {
        if (content.startsWith(`<@${botId}>`))  return `<@${botId}>`;
        if (content.startsWith(`<@!${botId}>`)) return `<@!${botId}>`;
      }

      const guildId = message.guildId;

      if (!guildId) {
        return content.startsWith(".") ? "." : null;
      }

      let prefix = ".";
      if (prefixCache.has(guildId)) {
        prefix = prefixCache.get(guildId);
      } else {
        const guildCfg = await GuildConfig.findOne({ guildId });
        prefix = guildCfg?.prefix ?? ".";
        prefixCache.set(guildId, prefix);
      }

      return content.startsWith(prefix) ? prefix : null;
    },
  });

  bot.setMaxListeners(20);
  bot.load("commands");
  wrapPrefixedCommands(log);
  loadAndRegisterEvents(bot, log);
  registerReadyHandler(bot, config, log);
  registerMessageHandler(bot, log);
  bot.login(config.TOKEN);

  return bot;
}

module.exports = { createBot };
