const { GroupBuilder } = require("gralonium");
const opinion = require("./opinion");
const critica = require("./critica");
const excusa = require("./excusa");
const teoria = require("./teoria");
const roast = require("./roast");
const lol = require("./lol");

const data = {
  data: new GroupBuilder({
    name: "fun",
    description: "Comandos de personalidad y diversión",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand(opinion.command)
    .addCommand(critica.command)
    .addCommand(excusa.command)
    .addCommand(teoria.command)
    .addCommand(roast.command)
    .addCommand(lol.command),
};

module.exports = { data };
