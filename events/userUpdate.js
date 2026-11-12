const { recordImageIfNew } = require("../src/history");

const event = {
  name: "userUpdate",
  once: false,
  async code(_bot, oldUser, newUser) {
    if (!newUser || newUser.bot) return;

    if (oldUser?.avatar && oldUser.avatar !== newUser.avatar) {
      await recordImageIfNew("avatar", newUser.id, oldUser.displayAvatarURL({ size: 4096 })).catch(() => {});
    }
    if (oldUser?.avatar !== newUser.avatar) {
      await recordImageIfNew("avatar", newUser.id, newUser.displayAvatarURL({ size: 4096 })).catch(() => {});
    }

    if (oldUser?.banner !== newUser.banner) {
      const oldBanner = oldUser?.bannerURL?.({ size: 4096 });
      const newBanner = newUser.bannerURL?.({ size: 4096 });
      if (oldBanner) await recordImageIfNew("banner", newUser.id, oldBanner).catch(() => {});
      if (newBanner) await recordImageIfNew("banner", newUser.id, newBanner).catch(() => {});
    }
  },
};

module.exports = { data: event };
