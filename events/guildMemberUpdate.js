const { recordImageIfNew } = require("../src/history");

const event = {
  name: "guildMemberUpdate",
  once: false,
  async code(_bot, oldMember, newMember) {
    if (!newMember?.guild?.id || newMember.user?.bot) return;
    if (oldMember?.avatar === newMember.avatar) return;

    const targetId = `${newMember.guild.id}:${newMember.id}`;
    if (oldMember?.avatar) {
      await recordImageIfNew("server_avatar", targetId, oldMember.avatarURL({ size: 4096 })).catch(() => {});
    }
    if (newMember.avatar) {
      await recordImageIfNew("server_avatar", targetId, newMember.avatarURL({ size: 4096 })).catch(() => {});
    }
  },
};

module.exports = { data: event };
