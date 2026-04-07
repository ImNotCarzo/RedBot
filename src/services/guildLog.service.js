const Log = require("../../models/Log");

function assertGuildId(guildId) {
  if (!guildId || typeof guildId !== "string") {
    throw new TypeError("guildId inválido");
  }
}

function assertChannelId(channelId) {
  if (!channelId || typeof channelId !== "string") {
    throw new TypeError("channelId inválido");
  }
}

async function getLogChannelId(guildId) {
  assertGuildId(guildId);
  const doc = await Log.findOne({ guildId }).lean();
  return doc?.channelId ?? null;
}

async function setLogChannel(guildId, channelId) {
  assertGuildId(guildId);
  assertChannelId(channelId);
  await Log.findOneAndUpdate(
    { guildId },
    { channelId },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return channelId;
}

async function clearLogChannel(guildId) {
  assertGuildId(guildId);
  const removed = await Log.findOneAndDelete({ guildId });
  return Boolean(removed);
}

async function cleanupBrokenLogChannel(guildId) {
  assertGuildId(guildId);
  await Log.deleteOne({ guildId });
}

module.exports = {
  getLogChannelId,
  setLogChannel,
  clearLogChannel,
  cleanupBrokenLogChannel,
};
