const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { createCommandLogger, INVITE_URL, SUPPORT_URL } = require("../../_shared/runtime");

const log = createCommandLogger("CMD_UTIL");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "invite",
      description: "Obtén los links de invitación del bot",
      aliases: ["inv"],
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      try {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Invitar").setStyle(ButtonStyle.Link).setURL(INVITE_URL),
          new ButtonBuilder().setLabel("Soporte").setStyle(ButtonStyle.Link).setURL(SUPPORT_URL)
        );
        await ctx.send({ content: INVITE_URL, components: [row] });
      } catch (err) {
        log.error("[util invite]", { err: err?.message ?? String(err) });
        await ctx.send({ content: "Algo salió mal", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
