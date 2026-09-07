const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, noGuildReply } = require("../../_shared/runtime");

const COLOR = RED;
const log = createCommandLogger("CMD_SERVER");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "banner",
      description: "Muestra el banner del servidor",
    }),

    async code(ctx) {
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);
        const bannerURL = guild.bannerURL({ size: 4096, extension: "png" });
        if (!bannerURL) return ctx.send("Este servidor no tiene banner");

        const embed = new EmbedBuilder()
          .setTitle(`Banner de ${guild.name}`)
          .setURL(bannerURL)
          .setImage(bannerURL)
          .setColor(COLOR)
          .setTimestamp();

        await ctx.send({ embeds: [embed] });
      } catch (err) {
        log.error("Error en server banner", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener el banner");
      }
    },
  },
};
