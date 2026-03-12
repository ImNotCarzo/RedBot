const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Warn = require("../../models/Warn");
const sendLog = require("../../utils/sendLog");
const { GREEN } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "removewarn",
    description: "Elimina una advertencia por su ID",
    aliases: ["delwarn", "warnremove"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const warnId = ctx.args?.[0]?.toUpperCase();
      if (!warnId) return ctx.send("Uso: `.removewarn <ID>`");

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tienes el permiso `ModerateMembers`");

      const warn = await Warn.findOneAndDelete({ guildId: guild.id, warnId });
      if (!warn) return ctx.send(`No encontré la advertencia con ID \`${warnId}\``);

      const user = await guild.client.users.fetch(warn.userId).catch(() => null);
      const username = user?.globalName || user?.username || warn.userId;

      const embed = new EmbedBuilder()
        .setDescription(`Se eliminó la advertencia **\`${warnId}\`** de **${username}**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
      await sendLog(guild, embed);
    } catch {
      await ctx.send("No se pudo eliminar la advertencia");
    }
  },
};

module.exports = { data };
