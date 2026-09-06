const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "hide",
    description: "Oculta un canal a @everyone",
    aliases: ["chhide", "hidechannel", "channelhide"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
