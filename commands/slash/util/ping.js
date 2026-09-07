const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger } = require("../../_shared/runtime");

const log = createCommandLogger("CMD_UTIL");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "ping",
      description: "Muestra la latencia del bot",
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      try {
        const before = Date.now();
        const sent = await ctx.send({ content: "<a:typing:1484407380291616778>  RedBot está pensando..." });
        const msgPing = Date.now() - before;
        const apiPing = ctx.bot?.ws?.ping ?? 0;

        await sent.edit({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setTitle("Pong!")
              .setDescription(
                `> **Mensaje:** \`${msgPing}ms\`\n` +
                `> **API:** \`${apiPing}ms\``
              )
              .setColor(RED),
          ],
        });
      } catch (err) {
        log.error("[util ping]", { err: err?.message ?? String(err) });
        await ctx.send({ content: "Algo salió mal", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
