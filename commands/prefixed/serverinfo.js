const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "server",
    description: "Muestra información del servidor",
    aliases: ["sv", "serverinfo", "si"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
