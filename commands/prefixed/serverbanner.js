const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const COLOR = "#ff383d";

const data = {
  data: new CommandBuilder({
    name: "serverbanner",
    description: "Muestra el banner del servidor",
    aliases: ["sbanner", "banner"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
