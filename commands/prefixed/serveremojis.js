const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "emojis",
    description: "Muestra todos los emojis del servidor",
    aliases: ["serveremojis", "emoji"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
