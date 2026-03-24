const { CommandBuilder } = require("erine");

const data = {
  data: new CommandBuilder({
    name: "askreset",
    description: "Limpia tu historial de conversación con la IA",
    aliases: ["reset"],
    as_prefix: true,
    as_slash: false,
  }),

  async code() {},
};

module.exports = { data };
