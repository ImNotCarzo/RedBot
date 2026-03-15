const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const TempBan = require("../../models/TempBan");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");
const { parseDuration, formatDuration, resolveMember, scheduleTempUnban } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "tempban",
    description: "Banea a un usuario temporalmente",
    aliases: ["modtempban", "tban"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) {
  const paramerror = new EmbedBuilder()
    .setAuthor({ name: "Comando Tempban" }),
    .setFields({
      name: "Usos:",
      value: "Banea a un usuario temporalmente",
    }, {
      name: "Aliases:",
      value: `\`modtempban\`, \`tban\``,
    }),
    .setDescription(`\`\`\`js\n .tempban <@usuario> <tiempo> /razonOpcional/>\n Ejemplo: .tempban 10d @loge chau\`\`\``);

  return ctx.send({ embeds: [paramerror] });
}

      const durationStr = ctx.args?.[1] || null;
      if (!durationStr) return ctx.send("Proporciona una duración (ej: 1h, 30m, 2d)");

      const duration = parseDuration(durationStr);
      if (!duration) return ctx.send("Duración inválida. Usa formato como `10m`, `1h`, `2d`");

      const reason = ctx.args?.slice(2).join(" ").trim() || "Sin razón";
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tienes el permiso `BanMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tengo permiso para banear");

      if (member.id === guild.ownerId)
        return ctx.send("No puedo banear al dueño del servidor");

      if (member.roles.highest.position >= guild.members.me.roles.highest.position)
        return ctx.send("No puedo actuar sobre alguien con igual o mayor rango que el mío");

      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send("No puedes actuar sobre alguien con igual o mayor rango que el tuyo");

      const unbanAt = new Date(Date.now() + duration);

      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setDescription(
              `Fuiste baneado temporalmente de **${guild.name}**\n` +
              `Duración: **${formatDuration(duration)}**\n` +
              `Razón: ${reason}`
            )
            .setTimestamp(),
        ],
      }).catch(() => {});

      await member.ban({ reason: `${modTag}: tempban ${formatDuration(duration)}: ${reason}` });

      await TempBan.create({ guildId: guild.id, userId: member.id, unbanAt });
      scheduleTempUnban(ctx.bot ?? ctx.client, guild.id, member.id, unbanAt);

      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue baneado por **${formatDuration(duration)}**`)
        .setColor(RED)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Tempban ejecutado")
        .setColor(RED)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`,             inline: true },
          { name: "Moderador", value: modTag,                                                inline: true },
          { name: "Duración",  value: formatDuration(duration),                             inline: true },
          { name: "Expira",    value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`,      inline: true },
          { name: "Razón",     value: reason,                                               inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo ejecutar el tempban");
    }
  },
};

module.exports = { data };
