const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { BLUE } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "channelclone",
    description: "Clona un canal con su configuración",
    aliases: ["chclone", "clonechannel"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const channel = ctx.message?.mentions?.channels?.first() ?? ctx.channel;
      const modTag  = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tienes el permiso `ManageChannels`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tengo permiso para gestionar canales");

      const cloned = await channel.clone({ reason: `${modTag}: channel clone` });

      const publicEmbed = new EmbedBuilder()
        .setDescription(`${channel} fue clonado → ${cloned}`)
        .setColor(BLUE)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Canal clonado")
        .setColor(BLUE)
        .addFields(
          { name: "Original",  value: `${channel} (\`${channel.id}\`)`, inline: true },
          { name: "Clon",      value: `${cloned} (\`${cloned.id}\`)`,   inline: true },
          { name: "Moderador", value: modTag,                            inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo clonar el canal");
    }
  },
};

module.exports = { data };
