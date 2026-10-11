const { CommandBuilder } = require("gralonium");

const data = {
  data: new CommandBuilder({
    name: "userperms",
    description: "Muestra los permisos de un usuario en el servidor",
    aliases: ["perms", "permissions", "uperms", "up"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {},
};

module.exports = { data };
