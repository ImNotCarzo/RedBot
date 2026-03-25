const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "purge",
    description: "Elimina mensajes del canal",
    aliases: ["modpurge", "clear", "prune"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
