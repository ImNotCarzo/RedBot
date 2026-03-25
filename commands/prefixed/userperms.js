const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "userperms",
    description: "Muestra los permisos de un usuario en el servidor",
    aliases: ["perms", "permissions", "uperms"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
