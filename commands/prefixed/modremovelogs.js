const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  guildId:   { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
});
const Log = mongoose.models.Log || mongoose.model("Log", logSchema);

const RED = "#ff383d";

const data = {
  data: new CommandBuilder({
    name: "removelogs",
    description: "Desactiva los logs de RedBot en el servidor",
    aliases: ["modremovelogs", "removelog", "unsetlogs"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return ctx.send("No tenés el permiso `ManageGuild`");

      const result = await Log.findOneAndDelete({ guildId: guild.id });
      if (!result) return ctx.send("No hay un canal de logs configurado");

      const embed = new EmbedBuilder()
        .setTitle("Canal de logs removido")
        .setColor(RED)
        .setDescription("Ya no se enviarán logs")
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch {
      await ctx.send("No se pudo eliminar la configuración de logs");
    }
  },
};

module.exports = { data };
