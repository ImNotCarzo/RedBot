const { CommandBuilder, Plugins } = require("gralonium");
const data = {
  data: new CommandBuilder({
    name: "aviso",
    description: "Comandos de administración del bot.",
    as_prefix: true,
    as_slash: false,
  }),
  async code(ctx) {
    
    await ctx.react(✌🏿);
  },
};

module.exports = { data };
