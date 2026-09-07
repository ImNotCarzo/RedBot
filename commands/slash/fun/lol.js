const { CommandBuilder, ParamsBuilder } = require("gralonium");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "lol",
      description: "Ríete de algo así bien jaja",
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      await ctx.send("😂🖕");
    },
  },
};
