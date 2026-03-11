const { CommandBuilder } = require("erine");
const { deleteConversacion } = require("../utils/askMemory");

const data = {
  data: new CommandBuilder({
    name: "askreset",
    description: "Limpia tu historial de conversación con la IA",
    aliases: ["reset"],
    as_prefix: true,
    as_slash: true,
  }),

  async code(ctx) {
    const userId = ctx.user?.id ?? ctx.author?.id;
    deleteConversacion(userId);
    await ctx.send("Bite the dust f");
  },
};

module.exports = { data };