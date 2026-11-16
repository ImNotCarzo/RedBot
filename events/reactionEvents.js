const { handleDramaReaction } = require("../src/moderationExtra");
const { handleEmojiReactionRole } = require("../src/reactionRoles");

const data = [
  {
    name: "messageReactionAdd",
    once: false,
    async code(bot, reaction, user) {
      await handleDramaReaction(reaction, user).catch(() => {});
      await handleEmojiReactionRole(bot, reaction, user, true).catch(() => {});
    },
  },
  {
    name: "messageReactionRemove",
    once: false,
    async code(bot, reaction, user) {
      await handleEmojiReactionRole(bot, reaction, user, false).catch(() => {});
    },
  },
];

module.exports = { data };
