// commands/prefixed/serverlogo.js
const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "logo",
    description: "Muestra el logo del servidor",
    aliases: ["serverlogo", "servericon", "icon", "logo"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");
      if (!guild.iconURL()) return ctx.send("Este servidor no tiene logo");

      const url = guild.iconURL({ size: 4096, extension: "png" });
      const embed = new EmbedBuilder()
        .setTitle(`Logo de ${guild.name}`)
        .setURL(url)
        .setImage(url)
        .setColor("#ff383d")
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error en logo:", err);
      await ctx.send("No se pudo obtener el logo");
    }
  },
};

module.exports = { data };