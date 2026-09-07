const { GroupBuilder } = require("gralonium");
const info = require("./info");
const avatar = require("./avatar");
const banner = require("./banner");
const roles = require("./roles");
const permissions = require("./permissions");

const data = {
  data: new GroupBuilder({
    name: "user",
    description: "Comandos de usuario",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand(info.command)
    .addCommand(avatar.command)
    .addCommand(banner.command)
    .addCommand(roles.command)
    .addCommand(permissions.command),
};

module.exports = { data };
