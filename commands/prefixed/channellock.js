const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../src/services/logging.service");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "lock",
    description: "Bloquea un canal para usuarios normales",
    aliases: ["chlock", "lockdown", "channellock"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
