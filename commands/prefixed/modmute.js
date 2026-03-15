const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { GREEN } = require("../../utils/colors");
const { parseDuration, formatDuration, resolveMember } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "mute",
    description: "Silencia a un usuario",
    aliases: ["modmute", "timeout", "silenciar"],
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
    .setAuthor({ name: "Comando Mute" })
    .setFields({
      name: "Usos:",
      value: "Silencia a un usuario del servidor",
    }, {
      name: "Aliases:",
      value: `\`modmute\`, \`timeout\`, \`silenciar\``",
    })
    .setDescription(`\`\`\`js\n .mute <@usuario> <tiempo> /razonOpcional/>\n Ejemplo: .mute @loge 30m shhh\`\`\``);

  return ctx.send({ embeds: [paramerror] });
}

      const durationStr = ctx.args?.[1] || null;
      if (!durationStr) return ctx.send("Proporciona una duración (ej: 10m, 1h, 2d)");

      const duration = parseDuration(durationStr);
      if (!duration) return ctx.send("Duración inválida. Usa formato como `10m`, `1h`, `2d`");

      if (duration > 28 * 86_400_000)
        return ctx.send("La duración máxima del timeout es 28 días");

      const reason = ctx.args?.slice(2).join(" ").trim() || "Sin razón";
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tienes el permiso `ModerateMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tengo permiso para silenciar");

      if (member.id === guild.ownerId)
        return ctx.send("No puedo silenciar al dueño del servidor");

      if (member.roles.highest.position >= guild.members.me.roles.highest.position)
        return ctx.send("No puedo actuar sobre alguien con igual o mayor rango que el mío");

      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send("No puedes actuar sobre alguien con igual o mayor rango que el tuyo");

      await member.timeout(duration, `${modTag}: ${reason}`);

      const username = member.user.globalName || member.user.username;
      const tiempo = formatDuration(duration);
      const unmuteAt = Date.now() + duration;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue aislado por **${tiempo}**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(GREEN)
            .setDescription(`Fuiste aislado en **${guild.name}** por **${tiempo}**\n\n**Razón:** ${reason}`)
            .setTimestamp(),
        ],
      }).catch(() => {});

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario aislado")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`,        inline: true },
          { name: "Moderador", value: modTag,                                          inline: true },
          { name: "Duración",  value: tiempo,                                          inline: true },
          { name: "Expira",    value: `<t:${Math.floor(unmuteAt / 1000)}:R>`,          inline: true },
          { name: "Razón",     value: reason,                                          inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo silenciar al usuario");
    }
  },
};

module.exports = { data };
