const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "invite",
    description: "Obtén los links de invitación del bot",
    aliases: ["inv"],
    as_prefix: true,
    as_slash: false,
  }),
  
  async code(ctx) {},
};

module.exports = { data };
