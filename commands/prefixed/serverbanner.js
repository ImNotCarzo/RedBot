const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const COLOR = "#ff383d";

const data = {
  data: new CommandBuilder({
    name: "serverbanner",
    description: "Muestra el banner del servidor",
    aliases: ["sbanner", "banner"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");
      if (!guild.banner) return ctx.send("Este servidor no tiene banner");

      const url = guild.bannerURL({ size: 4096 });
      const embed = new EmbedBuilder()
        .setTitle(`Banner de ${guild.name}`)
        .setURL(url)
        .setImage(url)
        .setColor(COLOR)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error en serverbanner:", err);
      await ctx.send("No se pudo obtener el banner del servidor");
    }
  },
};

module.exports = { data };
