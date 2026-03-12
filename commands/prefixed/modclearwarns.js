const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Warn = require("../../models/Warn");
const sendLog = require("../../utils/sendLog");
const { GREEN } = require("../../utils/colors");
const { resolveMember } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "clearwarns",
    description: "Borra todas las advertencias de un usuario",
    aliases: ["warnsclear", "clearwarn"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("Uso: `.clearwarns @usuario`");

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tenés el permiso `ModerateMembers`");

      const result = await Warn.deleteMany({ guildId: guild.id, userId: member.id });

      if (!result.deletedCount)
        return ctx.send(`${member.user.tag} no tiene advertencias`);

      const count = result.deletedCount;
      const plural = count > 1 ? "advertencias" : "advertencia";
      const username = member.user.globalName || member.user.username;

      const embed = new EmbedBuilder()
        .setDescription(`Se eliminaron **${count}** ${plural} de **${username}**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
      await sendLog(guild, embed);
    } catch {
      await ctx.send("No se pudieron limpiar las advertencias");
    }
  },
};

module.exports = { data };
