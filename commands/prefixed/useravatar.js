const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { resolveMemberFlexible } = require("../../utils/helpers");

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
