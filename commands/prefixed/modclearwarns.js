const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");

const warnSchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  moderator: { type: String, required: true },
  reason:    { type: String, default: "Sin razón" },
  warnId:    { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const logSchema = new mongoose.Schema({
  guildId:   { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
});

const Warn = mongoose.models.Warn || mongoose.model("Warn", warnSchema);
const Log  = mongoose.models.Log  || mongoose.model("Log",  logSchema);

async function sendLog(guild, embed) {
  try {
    const doc = await Log.findOne({ guildId: guild.id });
    if (!doc) return;
    const ch = guild.channels.cache.get(doc.channelId);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch {}
}

const GREEN = "#23a55a";

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
    name: "clearwarns",
    description: "Borra todas las advertencias de un usuario",
    aliases: ["warnsclear", "clearwarn"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("Uso: `.clearwarns @usuario`");

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tenés el permiso `ModerateMembers`");

      const result = await Warn.deleteMany({ guildId: guild.id, userId: member.id });

      if (!result.deletedCount)
        return ctx.send(`${member.user.tag} no tiene advertencias`);

      const count = result.deletedCount;
      const plural = count > 1 ? "advertencias" : "advertencia";
      const username = member.user.globalName || member.user.username;

      const embed = new EmbedBuilder()
        .setDescription(`Se eliminaron **${count}** ${plural} de **${username}**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
      await sendLog(guild, embed);
    } catch {
      await ctx.send("No se pudieron limpiar las advertencias");
    }
  },
};

module.exports = { data };
