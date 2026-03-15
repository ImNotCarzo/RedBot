const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Log = require("../../models/Log");
const { GREEN } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "setlogs",
    description: "Establece el canal de logs para RedBot en el servidor",
    aliases: ["modsetlogs", "logchannel", "setlog"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return ctx.send("No tienes el permiso `ManageGuild`");

      const channel = ctx.message?.mentions?.channels?.first() ||
        (ctx.args?.[0] ? guild.channels.cache.get(ctx.args[0]) : null);

      if (!channel) {
  const paramerror = new EmbedBuilder()
    .setAuthor({ name: "Comando Setlogs" })
    .setFields({
      name: "Usos:",
      value: "Establece el canal de logs para RedBot en el servidor",
    }, {
      name: "Aliases:",
      value: `\`modsetlogs\`, \`logchanner\, \`setlog\```",
    })
    .setDescription(`\`\`\`js\n .setlogs <#canal>\n Ejemplo: .setlogs #uxiono\`\`\``);

  return ctx.send({ embeds: [paramerror] });
}
      if (!channel.isTextBased()) return ctx.send("El canal debe ser de texto");

      await Log.findOneAndUpdate(
        { guildId: guild.id },
        { channelId: channel.id },
        { upsert: true, new: true }
      );

      const embed = new EmbedBuilder()
        .setTitle("Canal de logs establecido")
        .setColor(GREEN)
        .setDescription(`Los logs se enviarán a ${channel}`)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch {
      await ctx.send("No se pudo establecer el canal de logs");
    }
  },
};

module.exports = { data };
