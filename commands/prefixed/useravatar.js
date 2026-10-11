const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "avatar",
    description: "Muestra el avatar de un usuario",
    aliases: ["av", "useravatar", "pfp"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
