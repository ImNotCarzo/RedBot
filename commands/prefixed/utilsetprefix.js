const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "setprefix",
    description: "Cambia o muestra el prefix del bot en este servidor",
    aliases: ["prefix"],
    as_prefix: true,
    as_slash: false,
  }),
  
  async code(ctx) {},
};

module.exports = { data };
