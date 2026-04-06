const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "lol",
    description: "Responde con un emoji random",
    as_prefix: true,
    as_slash: false,
  }),

  async code() {},
};

module.exports = { data };
