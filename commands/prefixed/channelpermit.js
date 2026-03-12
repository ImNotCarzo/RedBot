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
    name: "channelpermit",
    description: "Da acceso a un usuario en un canal",
    aliases: ["chpermit", "permit"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const member  = ctx.message?.mentions?.members?.first();
      const channel = ctx.message?.mentions?.channels?.first() ?? ctx.channel;

      if (!member) return ctx.send("Uso: `.channelpermit @usuario [#canal]`");

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tienes el permiso `ManageChannels`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tengo permiso para editar canales");

      await channel.permissionOverwrites.edit(member, {
        ViewChannel:  true,
        SendMessages: true,
      }, { reason: `${modTag}: channel permit` });

      const publicEmbed = new EmbedBuilder()
        .setDescription(`${member} ahora tiene acceso a ${channel}`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Acceso concedido")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Canal",     value: `${channel} (\`${channel.id}\`)`,        inline: true },
          { name: "Moderador", value: modTag,                                   inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo dar acceso al usuario");
    }
  },
};

module.exports = { data };
