const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "nuke",
    description: "Recrea el canal borrando todos sus mensajes",
    aliases: ["chnuke", "channelnuke"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
