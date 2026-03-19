const { CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "ping",
    description: "Muestra la latencia del bot",
    as_prefix: true,
    as_slash: false,
  }),
  params: new ParamsBuilder(),

  async code(ctx) {
    try {
      const before  = Date.now();
      const sent    = await ctx.send({ content: "..." });
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
            .setColor("#ff383d"),
        ], allowedMentions: { repliedUser: false } });
      });
    } catch (err) {
      console.error("[ping]", err);
      await ctx.send("Algo salió mal");
    }
  },
};

module.exports = { data };
