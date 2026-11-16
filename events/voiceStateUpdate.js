const { dispatchAutoRules } = require("../src/automation");
const { applyVoiceLinksForTransition, handleVoiceHubTransition } = require("../src/channelsExtra");

const data = {
  name: "voiceStateUpdate",
  once: false,
  async code(_bot, oldState, newState) {
    const guild = newState?.guild ?? oldState?.guild;
    const member = newState?.member ?? oldState?.member;
    if (!guild?.id || !member || member.user?.bot) return;

    const oldChId = oldState?.channelId ?? null;
    const newChId = newState?.channelId ?? null;
    if (oldChId === newChId) return;

    await applyVoiceLinksForTransition(member, oldChId, newChId).catch(() => {});
    await handleVoiceHubTransition(oldState, newState).catch(() => {});

    if (newChId) {
      await dispatchAutoRules("voice_join", {
        guild,
        member,
        channel: newState.channel ?? null,
      }).catch(() => {});
    }
  },
};

module.exports = { data };
