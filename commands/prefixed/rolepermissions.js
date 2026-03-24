const { CommandBuilder } = require("erine");

const data = {
  data: new CommandBuilder({
    name: "permissions",
    description: "Muestra permisos de un rol",
    aliases: ["roleperms"],
    as_prefix: true,
    as_slash: false,
  }),

  async code() {},
};

module.exports = { data };
