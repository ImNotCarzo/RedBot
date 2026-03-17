const { CommandBuilder } = require("erine");
const { EmbedBuilder, ChannelType } = require("discord.js");
const { BLUE, RED } = require("../../utils/colors");

const CHANNEL_TYPES = {
  [ChannelType.GuildText]:         "Texto",
  [ChannelType.GuildVoice]:        "Voz",
  [ChannelType.GuildCategory]:     "Categoría",
  [ChannelType.GuildAnnouncement]: "Anuncios",
  [ChannelType.GuildForum]:        "Foro",
  [ChannelType.GuildStageVoice]:   "Escenario",
  [ChannelType.GuildDirectory]:    "Directorio",
  [ChannelType.GuildMedia]:        "Media",
};

function formatSlowmode(seconds) {
  if (seconds === 0)  return "desactivado";
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

const data = {
  data: new CommandBuilder({
    name: "channel",
    description: "Muestra información de un canal",
    aliases: ["chinfo", "cinfo", "channelinfo"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const channel = ctx.message?.mentions?.channels?.first() ?? ctx.channel;
      const type    = CHANNEL_TYPES[channel.type] ?? "Desconocido";
      const created = `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`;

      const embed = new EmbedBuilder()
        .setTitle(`#${channel.name}`)
        .setColor(RED)
        .addFields(
          { name: "ID",                value: `\`${channel.id}\``,               inline: true },
          { name: "Tipo",              value: type,                                inline: true },
          { name: "Posición",          value: `${channel.position ?? "—"}`,       inline: true },
          { name: "Fecha de creación", value: created,                             inline: false },
          ...(channel.topic ? [{ name: "Tema",     value: channel.topic,                              inline: false }] : []),
          ...(channel.rateLimitPerUser ? [{ name: "Slowmode", value: formatSlowmode(channel.rateLimitPerUser), inline: true }] : []),
          ...(channel.nsfw !== undefined ? [{ name: "NSFW",   value: channel.nsfw ? "Sí" : "No",      inline: true }] : []),
        )
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch {
      await ctx.send("No se pudo obtener la información del canal");
    }
  },
};

module.exports = { data };
