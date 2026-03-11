const { CommandBuilder, ParamsBuilder } = require("erine");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "invite",
    description: "Obtén los links de invitación del bot",
    aliases: ["inv"],
    as_prefix: true,
    as_slash: false,
  }),
  params: new ParamsBuilder(),

  async code(ctx) {
    try {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Invitar")
          .setStyle(ButtonStyle.Link)
          .setURL("https://discord.com/oauth2/authorize?client_id=1020772849906098186"),
        new ButtonBuilder()
          .setLabel("Soporte")
          .setStyle(ButtonStyle.Link)
          .setURL("https://discord.gg/b8AKKaNWU6"),
      );

      await ctx.send({
        content: "https://discord.com/oauth2/authorize?client_id=1020772849906098186",
        components: [row],
      });
    } catch (err) {
      console.error("[invite]", err);
      await ctx.send("Algo salió mal");
    }
  },
};

module.exports = { data };