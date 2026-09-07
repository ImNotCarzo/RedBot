const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, noGuildReply } = require("../../_shared/runtime");

const COLOR = RED;
const log = createCommandLogger("CMD_SERVER");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "logo",
      description: "Muestra el logo del servidor",
    }),

    async code(ctx) {
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);
        if (!guild.iconURL()) return ctx.send("Este servidor no tiene logo");

        const embed = new EmbedBuilder()
          .setTitle(`Logo de ${guild.name}`)
          .setURL(guild.iconURL({ size: 4096, extension: "png" }))
          .setImage(guild.iconURL({ size: 4096, extension: "png" }))
          .setColor(COLOR)
          .setTimestamp();

        await ctx.send({ embeds: [embed] });
      } catch (err) {
        log.error("Error en server logo", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener el logo");
      }
    },
  },
};
