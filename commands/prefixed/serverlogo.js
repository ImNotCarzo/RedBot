const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "logo",
    description: "Muestra el logo del servidor",
    aliases: ["serverlogo", "servericon", "icon"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
