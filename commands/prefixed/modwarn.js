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

function generateId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const YELLOW = "#f0b132";
const GREEN  = "#23a55a";

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
    name: "warn",
    description: "Advierte a un usuario",
    aliases: ["modwarn", "advertir"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("Uso: `.warn @usuario <razón>`");

      const reason = ctx.args?.slice(1).join(" ").trim();
      if (!reason) return ctx.send("Proporcioná una razón para la advertencia");

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tenés el permiso `ModerateMembers`");

      if (member.user.bot)
        return ctx.send("No podés advertir a un bot");

      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send("No podés advertir a alguien con igual o mayor rango que el tuyo");

      const warnId = generateId();

      await Warn.create({
        guildId: guild.id,
        userId: member.id,
        moderator: ctx.author.id,
        reason,
        warnId,
      });

      const total = await Warn.countDocuments({ guildId: guild.id, userId: member.id });
      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue advertido`)
        .setColor(YELLOW)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Advertencia emitida")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",     value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador",   value: modTag,                                   inline: true },
          { name: "ID",          value: `\`${warnId}\``,                          inline: true },
          { name: "Total warns", value: `${total}`,                               inline: true },
          { name: "Razón",       value: reason,                                   inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);

      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Recibiste una advertencia en ${guild.name}`)
            .setColor(GREEN)
            .addFields(
              { name: "Razón",       value: reason },
              { name: "Total warns", value: `${total}`, inline: true },
              { name: "ID",          value: `\`${warnId}\``, inline: true },
            )
            .setTimestamp(),
        ],
      }).catch(() => {});
    } catch {
      await ctx.send("No se pudo registrar la advertencia");
    }
  },
};

module.exports = { data };
