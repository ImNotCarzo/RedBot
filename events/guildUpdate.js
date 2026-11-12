const { recordImageIfNew } = require("../src/history");

const event = {
  name: "guildUpdate",
  once: false,
  async code(_bot, oldGuild, newGuild) {
    if (!newGuild?.id) return;

    if (oldGuild?.icon !== newGuild.icon) {
      const oldIcon = oldGuild?.iconURL?.({ size: 4096, extension: "png" });
      const newIcon = newGuild.iconURL?.({ size: 4096, extension: "png" });
      if (oldIcon) await recordImageIfNew("server_logo", newGuild.id, oldIcon).catch(() => {});
      if (newIcon) await recordImageIfNew("server_logo", newGuild.id, newIcon).catch(() => {});
    }

    if (oldGuild?.banner !== newGuild.banner) {
      const oldBanner = oldGuild?.bannerURL?.({ size: 4096, extension: "png" });
      const newBanner = newGuild.bannerURL?.({ size: 4096, extension: "png" });
      if (oldBanner) await recordImageIfNew("server_banner", newGuild.id, oldBanner).catch(() => {});
      if (newBanner) await recordImageIfNew("server_banner", newGuild.id, newBanner).catch(() => {});
    }
  },
};

module.exports = { data: event };
