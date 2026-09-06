const { Gralonium } = require("gralonium");
const { botOptions } = require("./config");
const { getPrefix, DEFAULT_PREFIX } = require("./guild");
const { loadAndRegisterEvents } = require("./runtime");
const { wrapPrefixedCommands } = require("./adapter");

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

function createBot() {
  const bot = new Gralonium({
    ...botOptions,
    prefix: buildPrefixResolver(),
  });

  bot.setMaxListeners(20);
  return bot;
}

async function initializeBot(bot, config, log) {
  await bot.load("commands");
  wrapPrefixedCommands(log);
  loadAndRegisterEvents(bot, log);
  await bot.login(config.TOKEN);
}

module.exports = { createBot, initializeBot };
