const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  guildId:   { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
});
const Log = mongoose.models.Log || mongoose.model("Log", logSchema);

async function sendLog(guild, embed) {
  try {
    const doc = await Log.findOne({ guildId: guild.id });
    if (!doc) return;
    const ch = guild.channels.cache.get(doc.channelId);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch {}
}

const GREEN = "#23a55a";

const data = {
  data: new CommandBuilder({
    name: "channelunlock",
    description: "Abre un canal bloqueado",
    aliases: ["chunlock", "cunlock"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const channel = ctx.message?.mentions?.channels?.first() ?? ctx.channel;
      const modTag  = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tienes el permiso `ManageChannels`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tengo permiso para editar canales");

      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null, // null = volver al default del servidor
      }, { reason: `${modTag}: channel unlock` });

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${channel} fue abierto**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Canal desbloqueado")
        .setColor(GREEN)
        .addFields(
          { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
          { name: "Moderador", value: modTag,                            inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo desbloquear el canal");
    }
  },
};

module.exports = { data };
