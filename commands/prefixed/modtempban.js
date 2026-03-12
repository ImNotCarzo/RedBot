const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  guildId:   { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
});
const tempBanSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, required: true },
  unbanAt: { type: Date,   required: true },
});

const Log     = mongoose.models.Log     || mongoose.model("Log",     logSchema);
const TempBan = mongoose.models.TempBan || mongoose.model("TempBan", tempBanSchema);

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

function scheduleTempUnban(client, guildId, userId, unbanAt) {
  const delay = unbanAt.getTime() - Date.now();
  const execute = async () => {
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return;
      await guild.members.unban(userId, "Tempban expirado");
      await TempBan.deleteOne({ guildId, userId });
    } catch {
      await TempBan.deleteOne({ guildId, userId }).catch(() => {});
    }
  };
  if (delay <= 0) execute();
  else setTimeout(execute, delay);
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
    name: "tempban",
    description: "Banea a un usuario temporalmente",
    aliases: ["modtempban", "tban"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("Uso: `.tempban @usuario <duración> [razón]` (ej: 1h, 30m, 2d)");

      const durationStr = ctx.args?.[1] || null;
      if (!durationStr) return ctx.send("Proporcioná una duración (ej: 1h, 30m, 2d)");

      const duration = parseDuration(durationStr);
      if (!duration) return ctx.send("Duración inválida. Usá formato como `10m`, `1h`, `2d`");

      const reason = ctx.args?.slice(2).join(" ").trim() || "Sin razón";
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tenés el permiso `BanMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tengo permiso para banear");

      if (member.id === guild.ownerId)
        return ctx.send("No puedo banear al dueño del servidor");

      if (member.roles.highest.position >= guild.members.me.roles.highest.position)
        return ctx.send("No puedo actuar sobre alguien con igual o mayor rango que el mío");

      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send("No podés actuar sobre alguien con igual o mayor rango que el tuyo");

      const unbanAt = new Date(Date.now() + duration);

      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setDescription(
              `Fuiste baneado temporalmente de **${guild.name}**\n` +
              `Duración: **${formatDuration(duration)}**\n` +
              `Razón: ${reason}`
            )
            .setTimestamp(),
        ],
      }).catch(() => {});

      await member.ban({ reason: `${modTag}: tempban ${formatDuration(duration)}: ${reason}` });

      await TempBan.create({ guildId: guild.id, userId: member.id, unbanAt });
      scheduleTempUnban(ctx.bot ?? ctx.client, guild.id, member.id, unbanAt);

      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue baneado por **${formatDuration(duration)}**`)
        .setColor(RED)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Tempban ejecutado")
        .setColor(RED)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`,             inline: true },
          { name: "Moderador", value: modTag,                                                inline: true },
          { name: "Duración",  value: formatDuration(duration),                             inline: true },
          { name: "Expira",    value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`,      inline: true },
          { name: "Razón",     value: reason,                                               inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo ejecutar el tempban");
    }
  },
};

module.exports = { data };
