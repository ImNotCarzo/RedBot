const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { GREEN } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "unban",
    description: "Desbanea a un usuario por su ID",
    aliases: ["modunban", "desbanear"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const userId = ctx.args?.[0];
      if (!userId || !/^\d{17,20}$/.test(userId))
        {
  const paramerror = new EmbedBuilder()
    .setAuthor({ name: "Comando Unban" })
    .setFields({
      name: "Usos:",
      value: "Desbanea a un usuario por su ID",
    }, {
      name: "Aliases:",
      value: `\`modunban\`, \`desbanear\``,
    })
    .setDescription(`\`\`\`js\n .unban <@usuario> /razonOpcional/>\n Ejemplo: .unban 1020772849906098186 hola\`\`\``);

  return ctx.send({ embeds: [paramerror] });
}

      const reason = ctx.args?.slice(1).join(" ").trim() || "Sin razón";
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tienes el permiso `BanMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tengo permiso para desbanear");

      const ban = await guild.bans.fetch(userId).catch(() => null);
      if (!ban) return ctx.send("Ese usuario no está baneado en este servidor");

      await guild.members.unban(userId, `${modTag}: ${reason}`);

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${ban.user.tag}** fue desbaneado`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario desbaneado")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",   value: `${ban.user.tag} (\`${userId}\`)`, inline: true },
          { name: "Moderador", value: modTag,                              inline: true },
          { name: "Razón",     value: reason,                              inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo desbanear al usuario");
    }
  },
};

module.exports = { data };
