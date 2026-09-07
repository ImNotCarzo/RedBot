const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, ChannelType } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "channelinfo",
    description: "Muestra información de un canal",
    aliases: ["chinfo", "cinfo", "channelinfo"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
