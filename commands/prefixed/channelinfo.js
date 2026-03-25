const { CommandBuilder } = require("erine");
const { EmbedBuilder, ChannelType } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "channel",
    description: "Muestra información de un canal",
    aliases: ["chinfo", "cinfo", "channelinfo"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
