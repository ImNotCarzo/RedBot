const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { resolveMemberFlexible } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "ubanner",
    description: "Muestra el banner de un usuario",
    aliases: ["userbanner"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
