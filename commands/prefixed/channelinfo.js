const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "channelinfo",
    description: "Muestra información de un canal",
    aliases: ["chinfo", "cinfo"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
