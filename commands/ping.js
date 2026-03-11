const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "ping",
    description: "Muestra la latencia del bot.",
    as_prefix: true,
    as_slash: true,
  }),

  async code(ctx) {
    try {
      const before = Date.now();
      const sent = await ctx.send({ content: "..." });
      const messagePing = Date.now() - before;
      const apiPing = ctx.bot?.ws?.ping ?? 0;

      const embed = new EmbedBuilder()
        .setTitle("Pong!")
        .setDescription(`> **Mensaje:** \`${messagePing}ms\`\n> **API:** \`${apiPing}ms\``)
        .setColor("Red");

      await sent.edit({ content: "", embeds: [embed] });
    } catch (err) {
      console.error("Error ping:", err);
      await ctx.send("Algo salió mal");
    }
  },
};

module.exports = { data };