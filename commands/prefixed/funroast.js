const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { getAI } = require("../../utils/ai");

const data = {
  data: new CommandBuilder({
    name: "roast",
    description: "Critica despiadadamente a un usuario",
    aliases: ["quemar", "burn"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
