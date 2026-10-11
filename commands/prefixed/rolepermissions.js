const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "roleperms",
    description: "Muestra permisos de un rol",
    aliases: ["rperms"],
    as_prefix: true,
    as_slash: false,
  }),

  async code() {},
};

module.exports = { data };
