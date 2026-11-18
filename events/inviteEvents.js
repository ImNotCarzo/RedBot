const {
  cacheInviteEntry,
  clearGuildInviteCache,
  removeCachedInvite,
  sendWelcomeOrGoodbye,
  trackMemberLeaveInvite,
} = require("../src/community");

const data = [
  {
    name: "inviteCreate",
    once: false,
    async code(_bot, invite) {
      cacheInviteEntry(invite);
    },
  },
  {
    name: "inviteDelete",
    once: false,
    async code(_bot, invite) {
      removeCachedInvite(invite);
    },
  },
  {
    name: "guildDelete",
    once: false,
    async code(_bot, guild) {
      clearGuildInviteCache(guild?.id);
    },
  },
  {
    name: "guildMemberRemove",
    once: false,
    async code(_bot, member) {
      if (!member?.guild?.id) return;
      if (!member.user?.bot) {
        await trackMemberLeaveInvite(member).catch(() => {});
      }
      await sendWelcomeOrGoodbye(member, "goodbye").catch(() => {});
    },
  },
];

module.exports = { data };
