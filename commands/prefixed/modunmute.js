const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { GREEN } = require("../../utils/colors");
const { resolveMember } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "unmute",
    description: "Quita el timeout a un usuario",
    aliases: ["modunmute", "untimeout"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("Uso: `.unmute @usuario [razón]`");

      const reason = ctx.args?.slice(1).join(" ").trim() || "Sin razón";
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tenés el permiso `ModerateMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tengo permiso para desmutear");

      if (!member.isCommunicationDisabled())
        return ctx.send("Este usuario no tiene timeout activo");

      await member.timeout(null, `${modTag}: ${reason}`);

      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`Timeout de **${username}** removido`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Timeout removido")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: modTag,                                    inline: true },
          { name: "Razón",     value: reason,                                    inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo quitar el timeout");
    }
  },
};

module.exports = { data };
