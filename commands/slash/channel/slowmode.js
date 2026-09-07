const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { noGuildReply } = require("../../_shared/runtime");

function formatSlowmode(seconds) {
  if (seconds === 0) return "desactivado";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function parseSlowmode(str) {
  const match = str.match(/^(\d+)(s|m|h)?$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2] ?? "s";
  const multipliers = { s: 1, m: 60, h: 3600 };
  const seconds = value * multipliers[unit];
  if (seconds < 0 || seconds > 21600) return null;
  return seconds;
}

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "slowmode",
      description: "Establece el slowmode de un canal (0 para desactivar, máx 6h)",
    }),
    params: new ParamsBuilder()
      .addString({ name: "tiempo", description: "Tiempo (ej: 5s, 10m, 1h, 0 para desactivar)", required: true })
      .addChannel({ name: "canal", description: "Canal objetivo (opcional, por defecto el actual)", required: false }),
    plugins: [Plugins.hasPerms("ManageChannels"), Plugins.hasBotPerms("ManageChannels")],

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag ?? ctx.author?.tag;
      const seconds = parseSlowmode(ctx.get("tiempo"));

      if (seconds === null)
        return ctx.send({ content: "Tiempo inválido. Usa `5s`, `10m`, `1h` o `0` para desactivar. Máximo 6h.", flags: MessageFlags.Ephemeral });

      try {
        await channel.setRateLimitPerUser(seconds, `${modTag}: channel slowmode`);

        const formatted = formatSlowmode(seconds);

        const publicEmbed = new EmbedBuilder()
          .setDescription(
            seconds === 0
              ? `El slowmode en ${channel} fue desactivado`
              : `El slowmode de ${channel} se estableció en **${formatted}**`
          )
          .setColor(RED);

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Slowmode actualizado")
          .setColor(RED)
          .addFields(
            { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true },
            { name: "Slowmode", value: formatted, inline: true }
          );

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo cambiar el slowmode", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
