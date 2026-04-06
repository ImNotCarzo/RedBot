const { CommandBuilder } = require("gralonium");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "removelogs",
    description: "Desactiva los logs de RedBot en el servidor",
    aliases: ["modremovelogs", "removelog", "unsetlogs"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
