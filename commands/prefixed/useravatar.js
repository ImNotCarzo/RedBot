const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { resolveMemberFlexible } = require("../../src/resolvers/member.resolver");

const data = {
  data: new CommandBuilder({
    name: "avatar",
    description: "Muestra el avatar de un usuario",
    aliases: ["av", "useravatar"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
