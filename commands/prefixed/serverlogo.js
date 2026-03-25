const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "logo",
    description: "Muestra el logo del servidor",
    aliases: ["serverlogo", "servericon", "icon", "logo"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
