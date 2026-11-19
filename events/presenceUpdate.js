const { ActivityType, ChannelType } = require("discord.js");
const { isVoiceAutoStatusEnabled, scheduleVoiceAutoStatusSync } = require("../src/channelsExtra");

function getActivitySignature(presence) {
  const acts = presence?.activities ?? [];
  return acts
    .filter((a) => a && a.type !== ActivityType.Custom && a.name)
    .map((a) => `${a.type}:${a.name}`)
    .join("|");
}

const data = {
  name: "presenceUpdate",
  once: false,
  async code(_bot, oldPresence, newPresence) {
    const user = newPresence?.user ?? oldPresence?.user;
    if (!user || user.bot) return;

    const guild = newPresence?.guild ?? oldPresence?.guild;
    const member = newPresence?.member ?? oldPresence?.member;
    if (!guild?.id || !member) return;

    const vc = member.voice?.channel;
    if (!vc || vc.type !== ChannelType.GuildVoice) return;

    if (getActivitySignature(oldPresence) === getActivitySignature(newPresence)) return;
    if (!(await isVoiceAutoStatusEnabled(guild.id))) return;

    scheduleVoiceAutoStatusSync(vc);
  },
};

module.exports = { data };
