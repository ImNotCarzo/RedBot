const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "user",
    description: "Muestra información de un usuario",
    aliases: ["userinfo", "ui", "whois"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
