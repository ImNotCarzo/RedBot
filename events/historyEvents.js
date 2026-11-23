const { recordImageIfNew } = require("../src/history");

async function recordPair(type, targetId, oldUrl, newUrl) {
  if (oldUrl) await recordImageIfNew(type, targetId, oldUrl).catch(() => {});
  if (newUrl) await recordImageIfNew(type, targetId, newUrl).catch(() => {});
}

const data = [
  {
    name: "userUpdate",
    once: false,
    async code(_bot, oldUser, newUser) {
      if (!newUser || newUser.bot || oldUser?.partial) return;

      if (oldUser?.avatar !== newUser.avatar) {
        await recordPair(
          "avatar",
          newUser.id,
          oldUser?.avatar ? oldUser.displayAvatarURL({ size: 4096 }) : null,
          newUser.displayAvatarURL({ size: 4096 })
        );
      }

      if (oldUser?.banner !== newUser.banner) {
        await recordPair(
          "banner",
          newUser.id,
          oldUser?.bannerURL?.({ size: 4096 }),
          newUser.bannerURL?.({ size: 4096 })
        );
      }
    },
  },
  {
    name: "guildMemberUpdate",
    once: false,
    async code(_bot, oldMember, newMember) {
      if (!newMember?.guild?.id || newMember.user?.bot || oldMember?.partial) return;
      if (oldMember?.avatar === newMember.avatar) return;

      const targetId = `${newMember.guild.id}:${newMember.id}`;
      await recordPair(
        "server_avatar",
        targetId,
        oldMember?.avatar ? oldMember.avatarURL({ size: 4096 }) : null,
        newMember.avatar ? newMember.avatarURL({ size: 4096 }) : null
      );
    },
  },
  {
    name: "guildUpdate",
    once: false,
    async code(_bot, oldGuild, newGuild) {
      if (!newGuild?.id) return;

      if (oldGuild?.icon !== newGuild.icon) {
        await recordPair(
          "server_logo",
          newGuild.id,
          oldGuild?.iconURL?.({ size: 4096, extension: "png" }),
          newGuild.iconURL?.({ size: 4096, extension: "png" })
        );
      }

      if (oldGuild?.banner !== newGuild.banner) {
        await recordPair(
          "server_banner",
          newGuild.id,
          oldGuild?.bannerURL?.({ size: 4096, extension: "png" }),
          newGuild.bannerURL?.({ size: 4096, extension: "png" })
        );
      }
    },
  },
];

module.exports = { data };
