const { CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "ping",
    description: "Muestra la latencia del bot",
    as_prefix: true,
    as_slash: false,
  }),
  
  async code(ctx) {},
};

module.exports = { data };
