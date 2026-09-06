const { CommandBuilder } = require("gralonium");

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
