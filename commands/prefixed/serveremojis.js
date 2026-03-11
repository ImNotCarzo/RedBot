const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "emojis",
    description: "Muestra todos los emojis del servidor",
    aliases: ["serveremojis"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const emojis = guild.emojis.cache.map((e) => e.toString());
      if (!emojis.length) return ctx.send("Este servidor no tiene emojis");

      const embed = new EmbedBuilder()
        .setTitle(`Emojis de ${guild.name} (${emojis.length})`)
        .setDescription(emojis.join(" "))
        .setColor("#ff383d")
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error en emojis:", err);
      await ctx.send("No se pudo obtener los emojis");
    }
  },
};

module.exports = { data };