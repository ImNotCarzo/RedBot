const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "nuke",
    description: "Recrea el canal borrando todos sus mensajes",
    aliases: ["chnuke", "channelnuke"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const channel = ctx.message?.mentions?.channels?.first() ?? ctx.channel;
      const modTag  = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
        return ctx.send("No tienes el permiso `Administrator`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tengo permiso para gestionar canales");

      const parent     = channel.parentId;
      const position   = channel.position;
      const name       = channel.name;
      const topic      = channel.topic;
      const nsfw       = channel.nsfw;
      const slowmode   = channel.rateLimitPerUser;
      const overwrites = channel.permissionOverwrites.cache;

      const newChannel = await guild.channels.create({
        name,
        type:             channel.type,
        topic:            topic ?? undefined,
        nsfw,
        rateLimitPerUser: slowmode,
        parent:           parent ?? undefined,
        permissionOverwrites: overwrites.map((o) => ({
          id:    o.id,
          allow: o.allow,
          deny:  o.deny,
        })),
        reason: `${modTag}: channel nuke`,
      });

      await newChannel.setPosition(position).catch(() => {});
      await channel.delete(`${modTag}: channel nuke`);

      const nukeEmbed = new EmbedBuilder()
        .setDescription("Canal nukeado, f")
        .setColor(RED)
        .setTimestamp();

      await newChannel.send({ embeds: [nukeEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Canal nukeado")
        .setColor(RED)
        .addFields(
          { name: "Canal",     value: `\`#${name}\``,           inline: true },
          { name: "Nuevo ID",  value: `\`${newChannel.id}\``,   inline: true },
          { name: "Moderador", value: modTag,                    inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo nukear el canal");
    }
  },
};

module.exports = { data };
