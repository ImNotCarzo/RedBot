const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { deleteConversacion } = require("../../../src/ai");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "askreset",
      description: "Limpia tu historial de conversación con la IA",
      aliases: ["reset"],
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      const userId = ctx.user?.id ?? ctx.author?.id;
      deleteConversacion(userId);
      await ctx.send({ content: "Tu historial de conversación fue reiniciado." });
    },
  },
};
