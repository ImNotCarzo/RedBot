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

function formatSlowmode(seconds) {
  if (seconds === 0)  return "desactivado";
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function parseSlowmode(str) {
  const match = str.match(/^(\d+)(s|m|h)?$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit  = match[2] ?? "s";
  const multipliers = { s: 1, m: 60, h: 3600 };
  const seconds = value * multipliers[unit];
  if (seconds < 0 || seconds > 21600) return null;
  return seconds;
}

const BLUE = "#5865f2";

const data = {
  data: new CommandBuilder({
    name: "channelslowmode",
    description: "Establece el slowmode de un canal (0 para desactivar, máx 6h)",
    aliases: ["chslowmode", "slowmode", "sm"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const args    = ctx.args ?? [];
      const channel = ctx.message?.mentions?.channels?.first() ?? ctx.channel;
      // The time argument is the first non-channel-mention arg
      const timeArg = args.find((a) => !/^<#\d+>$/.test(a));

      if (!timeArg) return ctx.send("Uso: `.channelslowmode <tiempo> [#canal]` — Ej: `5s`, `10m`, `1h`, `0` para desactivar. Máx 6h.");

      const seconds = parseSlowmode(timeArg);
      if (seconds === null) return ctx.send("Tiempo inválido. Usa `5s`, `10m`, `1h` o `0` para desactivar. Máximo 6h.");

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tienes el permiso `ManageChannels`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tengo permiso para editar canales");

      const modTag  = ctx.author?.tag ?? ctx.author?.username;

      await channel.setRateLimitPerUser(seconds, `${modTag}: channel slowmode`);

      const formatted = formatSlowmode(seconds);

      const publicEmbed = new EmbedBuilder()
        .setDescription(
          seconds === 0
            ? `El slowmode en ${channel} fue desactivado`
            : `El slowmode en ${channel} se estableció en **${formatted}**`
        )
        .setColor(BLUE)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Slowmode actualizado")
        .setColor(BLUE)
        .addFields(
          { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
          { name: "Moderador", value: modTag,                            inline: true },
          { name: "Slowmode",  value: formatted,                         inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo cambiar el slowmode");
    }
  },
};

module.exports = { data };
