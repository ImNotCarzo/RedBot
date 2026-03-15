const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { BLUE } = require("../../utils/colors");

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

const data = {
  data: new CommandBuilder({
    name: "slowmode",
    description: "Establece el slowmode de un canal (0 para desactivar, máx 6h)",
    aliases: ["sm", "chslowmode", "channelslowmode"],
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

      if (!timeArg) {
  const paramerror = new EmbedBuilder()
    .setAuthor({ name: "Comando Slowmode" })
    .setFields({
      name: "Usos:",
      value: "Establece un slowmode para el canal",
    }, {
      name: "Aliases:",
      value: `\`sm\`, \`chslowmode\`, \`channelslowmode\``,
    })
    .setDescription(`\`\`\`js\n .slowmode <tiempo> /canalOpcional/>\n Ejemplo: .slowmode 1h #uxiono\`\`\``);

  return ctx.send({ embeds: [paramerror] });
}

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
