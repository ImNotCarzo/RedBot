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

const RED = "#ff383d";

async function resolveMember(ctx, input) {
  if (!input) return null;
  if (ctx.message?.mentions?.members?.size) return ctx.message.mentions.members.first();
  if (/^\d{17,20}$/.test(input)) {
    const byId = await ctx.guild.members.fetch(input).catch(() => null);
    if (byId) return byId;
  }
  return null;
}

const data = {
  data: new CommandBuilder({
    name: "softban",
    description: "Expulsa a un usuario borrando sus mensajes (ban + unban inmediato)",
    aliases: ["modsoftban", "sban"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("Uso: `.softban @usuario [razón]`");

      const reason = ctx.args?.slice(1).join(" ").trim() || "Sin razón";
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tenés el permiso `BanMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tengo permiso para banear");

      if (member.id === guild.ownerId)
        return ctx.send("No puedo softbanear al dueño del servidor");

      if (member.roles.highest.position >= guild.members.me.roles.highest.position)
        return ctx.send("No puedo actuar sobre alguien con igual o mayor rango que el mío");

      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send("No podés actuar sobre alguien con igual o mayor rango que el tuyo");

      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setDescription(`Fuiste expulsado (softban) de **${guild.name}**${reason !== "Sin razón" ? `\nRazón: ${reason}` : ""}`)
            .setTimestamp(),
        ],
      }).catch(() => {});

      // Delete messages from the last 24 hours (86400 seconds)
      await member.ban({ deleteMessageSeconds: 86400, reason: `${modTag}: softban: ${reason}` });
      await guild.members.unban(member.id, "softban - unban inmediato");

      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue expulsado (softban)`)
        .setColor(RED)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Softban ejecutado")
        .setColor(RED)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: modTag,                                    inline: true },
          { name: "Razón",     value: reason,                                    inline: false },
          { name: "Mensajes",  value: "Último día borrado",               inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo ejecutar el softban");
    }
  },
};

module.exports = { data };
