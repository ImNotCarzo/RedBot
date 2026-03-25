const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "clone",
    description: "Clona un canal con su configuración",
    aliases: ["chclone", "channelclone", "clonechannel"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
