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

function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[match[2]];
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}d`;
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
    name: "mute",
    description: "Silencia a un usuario (timeout)",
    aliases: ["modmute", "timeout", "silenciar"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("Uso: `.mute @usuario <duración> [razón]` (ej: 10m, 1h, 2d)");

      const durationStr = ctx.args?.[1] || null;
      if (!durationStr) return ctx.send("Proporcioná una duración (ej: 10m, 1h, 2d)");

      const duration = parseDuration(durationStr);
      if (!duration) return ctx.send("Duración inválida. Usá formato como `10m`, `1h`, `2d`");

      if (duration > 28 * 86_400_000)
        return ctx.send("La duración máxima del timeout es 28 días");

      const reason = ctx.args?.slice(2).join(" ").trim() || "Sin razón";
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tenés el permiso `ModerateMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tengo permiso para silenciar");

      if (member.id === guild.ownerId)
        return ctx.send("No puedo silenciar al dueño del servidor");

      if (member.roles.highest.position >= guild.members.me.roles.highest.position)
        return ctx.send("No puedo actuar sobre alguien con igual o mayor rango que el mío");

      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send("No podés actuar sobre alguien con igual o mayor rango que el tuyo");

      await member.timeout(duration, `${modTag}: ${reason}`);

      const username = member.user.globalName || member.user.username;
      const tiempo = formatDuration(duration);
      const unmuteAt = Date.now() + duration;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue aislado por **${tiempo}**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(GREEN)
            .setDescription(`Fuiste aislado en **${guild.name}** por **${tiempo}**\n\n**Razón:** ${reason}`)
            .setTimestamp(),
        ],
      }).catch(() => {});

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario aislado")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`,        inline: true },
          { name: "Moderador", value: modTag,                                          inline: true },
          { name: "Duración",  value: tiempo,                                          inline: true },
          { name: "Expira",    value: `<t:${Math.floor(unmuteAt / 1000)}:R>`,          inline: true },
          { name: "Razón",     value: reason,                                          inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo silenciar al usuario");
    }
  },
};

module.exports = { data };
