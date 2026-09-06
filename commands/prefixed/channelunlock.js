const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "unlock",
    description: "Abre un canal bloqueado",
    aliases: ["chunlock", "channelunlock", "cunlock"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
