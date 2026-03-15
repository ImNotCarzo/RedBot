const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Warn = require("../../models/Warn");
const sendLog = require("../../utils/sendLog");
const { YELLOW, GREEN, RED } = require("../../utils/colors");
const { generateId, resolveMember } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "warn",
    description: "Advierte a un usuario",
    aliases: ["modwarn", "advertir"],
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
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Warn", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nAdvierte a un usuario` +
            `\n\n**Aliases:**\n\`modwarn\`, \`advertir\`` +
            `\n\n\`\`\`js\n.warn <@usuario> <razón>\nEjemplo: .warn @loge lol\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      }

      const reason = ctx.args?.slice(1).join(" ").trim();
      if (!reason) return ctx.send("Proporciona una razón para la advertencia");

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tienes el permiso `ModerateMembers`");

      if (member.user.bot)
        return ctx.send("No puedes advertir a un bot");

      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send("No puedes advertir a alguien con igual o mayor rango que el tuyo");

      const warnId = generateId();

      await Warn.create({
        guildId: guild.id,
        userId: member.id,
        moderator: ctx.author.id,
        reason,
        warnId,
      });

      const total = await Warn.countDocuments({ guildId: guild.id, userId: member.id });
      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue advertido`)
        .setColor(YELLOW)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Advertencia emitida")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",     value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador",   value: modTag,                                   inline: true },
          { name: "ID",          value: `\`${warnId}\``,                          inline: true },
          { name: "Total warns", value: `${total}`,                               inline: true },
          { name: "Razón",       value: reason,                                   inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);

      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Recibiste una advertencia en ${guild.name}`)
            .setColor(GREEN)
            .addFields(
              { name: "Razón",       value: reason },
              { name: "Total warns", value: `${total}`, inline: true },
              { name: "ID",          value: `\`${warnId}\``, inline: true },
            )
            .setTimestamp(),
        ],
      }).catch(() => {});
    } catch {
      await ctx.send("No se pudo registrar la advertencia");
    }
  },
};

module.exports = { data };
