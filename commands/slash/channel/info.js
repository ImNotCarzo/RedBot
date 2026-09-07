const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, ChannelType } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, noGuildReply } = require("../../_shared/runtime");

const log = createCommandLogger("CMD_CHANNEL");

const CHANNEL_TYPES = {
  [ChannelType.GuildText]: "Texto",
  [ChannelType.GuildVoice]: "Voz",
  [ChannelType.GuildCategory]: "Categoría",
  [ChannelType.GuildAnnouncement]: "Anuncios",
  [ChannelType.GuildForum]: "Foro",
  [ChannelType.GuildStageVoice]: "Escenario",
  [ChannelType.GuildDirectory]: "Directorio",
  [ChannelType.GuildMedia]: "Media",
};

function formatSlowmode(seconds) {
  if (seconds === 0) return "desactivado";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "info",
      description: "Muestra información de un canal",
    }),
    params: new ParamsBuilder().addChannel({
      name: "canal",
      description: "Canal a inspeccionar (opcional, por defecto el actual)",
      required: false,
    }),

    async code(ctx) {
      try {
        const channel = ctx.get("canal") ?? ctx.channel;
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);
        if (!channel) {
          return ctx.send("No se pudo obtener el canal");
        }

        const createdTs = Math.floor(channel.createdTimestamp / 1000);
        const type = CHANNEL_TYPES[channel.type] ?? "Desconocido";

        const infoEmbed = new EmbedBuilder()
          .setTitle(`#${channel.name}`)
          .setThumbnail(guild?.iconURL({ size: 1024, extension: "png" }))
          .setColor(RED)
          .addFields(
            {
              name: "General",
              value:
                `> **ID:** \`${channel.id}\`\n` +
                (channel.topic ? `> **Tema:** ${channel.topic}\n` : "") +
                `> **Posición:** \`${channel.position ?? "No disponible"}\`\n` +
                `> **Creación:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
            },
            {
              name: "Configuración",
              value:
                `> **Tipo:** \`${type}\`\n` +
                `> **Slowmode:** \`${formatSlowmode(channel.rateLimitPerUser ?? 0)}\`\n` +
                `> **NSFW:** \`${channel.nsfw ? "Sí" : "No"}\``,
            }
          )
          .setTimestamp();

        await ctx.send({ embeds: [infoEmbed] });
      } catch (err) {
        log.error("Error en channel info", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener la información del canal");
      }
    },
  },
};
