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
      const guildId = message.guildId;
      const botId   = message.client?.user?.id;

      if (botId) {
        const mentionA = `<@${botId}>`;
        const mentionB = `<@!${botId}>`;
        const onlyMention = content.trim() === mentionA || content.trim() === mentionB;
        if (onlyMention) {
          const guildPrefix = guildId ? (prefixCache.get(guildId) ?? (await GuildConfig.findOne({ guildId }))?.prefix ?? ".") : ".";
          if (guildId && !prefixCache.has(guildId)) prefixCache.set(guildId, guildPrefix);
          await message.reply({
            content: `Mi prefijo en este servidor es \`${guildPrefix}\``,
            allowedMentions: { repliedUser: false },
          }).catch(() => {});
          return null;
        }
        if (content.startsWith(mentionA)) return mentionA;
        if (content.startsWith(mentionB)) return mentionB;
      }

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
