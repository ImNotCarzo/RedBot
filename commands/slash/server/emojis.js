const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, noGuildReply } = require("../../_shared/runtime");

const COLOR = RED;
const log = createCommandLogger("CMD_SERVER");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "emojis",
      description: "Muestra todos los emojis del servidor",
    }),

    async code(ctx) {
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const emojis = guild.emojis.cache.map((e) => e.toString());
        if (!emojis.length) return ctx.send("Este servidor no tiene emojis");

        const embed = new EmbedBuilder()
          .setTitle(`Emojis de ${guild.name} (${emojis.length})`)
          .setDescription(emojis.join(" "))
          .setColor(COLOR)
          .setTimestamp();

        await ctx.send({ embeds: [embed] });
      } catch (err) {
        log.error("Error en server emojis", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener los emojis");
      }
    },
  },
};
