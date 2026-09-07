const { GroupBuilder } = require("gralonium");
const info = require("./info");
const logo = require("./logo");
const banner = require("./banner");
const emojis = require("./emojis");
const roles = require("./roles");

const data = {
  data: new GroupBuilder({
    name: "server",
    description: "Comandos de información del servidor",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand(info.command)
    .addCommand(logo.command)
    .addCommand(banner.command)
    .addCommand(emojis.command)
    .addCommand(roles.command),
};

module.exports = { data };
