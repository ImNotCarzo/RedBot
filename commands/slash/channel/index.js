const { GroupBuilder } = require("gralonium");
const info = require("./info");
const rename = require("./rename");
const lock = require("./lock");
const unlock = require("./unlock");
const slowmode = require("./slowmode");
const nuke = require("./nuke");
const clone = require("./clone");
const permit = require("./permit");
const deny = require("./deny");
const hide = require("./hide");

const data = {
  data: new GroupBuilder({
    name: "channel",
    description: "Comandos de gestión de canales",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand(info.command)
    .addCommand(rename.command)
    .addCommand(lock.command)
    .addCommand(unlock.command)
    .addCommand(slowmode.command)
    .addCommand(nuke.command)
    .addCommand(clone.command)
    .addCommand(permit.command)
    .addCommand(deny.command)
    .addCommand(hide.command),
};

module.exports = { data };
