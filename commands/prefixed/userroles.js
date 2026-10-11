const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "uroles",
    description: "Muestra los roles de un usuario",
    aliases: ["userroles", "ur"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
