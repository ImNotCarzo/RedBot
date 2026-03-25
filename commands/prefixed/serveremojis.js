const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "emojis",
    description: "Muestra todos los emojis del servidor",
    aliases: ["serveremojis"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
