const { GroupBuilder } = require("gralonium");
const ping = require("./ping");
const botinfo = require("./botinfo");
const invite = require("./invite");
const setprefix = require("./setprefix");
const askreset = require("./askreset");
const translate = require("./translate");
const describe = require("./describe");
const transcribe = require("./transcribe");
const dm = require("./dm");
const resume = require("./resume");

const data = {
  data: new GroupBuilder({
    name: "util",
    description: "Comandos de utilidad general",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand(ping.command)
    .addCommand(botinfo.command)
    .addCommand(invite.command)
    .addCommand(setprefix.command)
    .addCommand(askreset.command)
    .addCommand(translate.command)
    .addCommand(describe.command)
    .addCommand(transcribe.command)
    .addCommand(dm.command)
    .addCommand(resume.command),
};

module.exports = { data };
