const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { getAI } = require("../../utils/ai");

const data = {
  data: new CommandBuilder({
    name: "excusa",
    description: "Genera una excusa ridícula pero creativa",
    aliases: ["coartada", "excuse"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
