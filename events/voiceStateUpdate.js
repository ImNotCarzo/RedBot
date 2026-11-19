const { ChannelType } = require("discord.js");
const { dispatchAutoRules } = require("../src/automation");
const { applyVoiceLinksForTransition, handleVoiceHubTransition, scheduleVoiceAutoStatusSync } = require("../src/channelsExtra");

const data = {
  name: "voiceStateUpdate",
  once: false,
  async code(_bot, oldState, newState) {
    const guild = newState?.guild ?? oldState?.guild;
    const member = newState?.member ?? oldState?.member;
    if (!guild?.id || !member) return;

    const oldChId = oldState?.channelId ?? null;
    const newChId = newState?.channelId ?? null;
    if (oldChId === newChId) return;

    const isBot = Boolean(member.user?.bot);

    if (!isBot) {
      await applyVoiceLinksForTransition(member, oldChId, newChId).catch(() => {});
    }

    await handleVoiceHubTransition(oldState, newState).catch(() => {});

    if (oldState?.channel?.type === ChannelType.GuildVoice) {
      scheduleVoiceAutoStatusSync(oldState.channel);
    }
    if (newState?.channel?.type === ChannelType.GuildVoice) {
      scheduleVoiceAutoStatusSync(newState.channel);
    }

    if (!isBot && newChId) {
      await dispatchAutoRules("voice_join", {
        guild,
        member,
        channel: newState.channel ?? null,
      }).catch(() => {});
    }
  },
};

module.exports = { data };
