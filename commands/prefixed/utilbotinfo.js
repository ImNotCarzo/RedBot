const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, version: djsVersion } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "botinfo",
    description: "Información general del bot",
    aliases: ["bot", "info"],
    as_prefix: true,
    as_slash: false,
  }),
  
  async code(ctx) {},
};

module.exports = { data };
