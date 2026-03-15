const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");
const { resolveMember } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "kick",
    description: "Expulsa a un usuario del servidor",
    aliases: ["modkick", "expulsar"],
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
          .setAuthor({ name: "Comando Kick", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nExpulsa a un usuario del servidor` +
            `\n\n**Aliases:**\n\`modkick\`, \`expulsar\`` +
            `\n\n\`\`\`js\n.kick <@usuario> /razonOpcional/\nEjemplo: .kick @loge chau\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      }

      const reason = ctx.args?.slice(1).join(" ").trim() || "Sin razón";
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.KickMembers))
        return ctx.send("No tienes el permiso `KickMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.KickMembers))
        return ctx.send("No tengo permiso para expulsar");

      if (member.id === guild.ownerId)
        return ctx.send("No puedo expulsar al dueño del servidor");

      if (member.roles.highest.position >= guild.members.me.roles.highest.position)
        return ctx.send("No puedo expulsar a alguien con igual o mayor rango que el mío");

      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send("No puedes expulsar a alguien con igual o mayor rango que el tuyo");

      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setDescription(`Fuiste expulsado de **${guild.name}**${reason !== "Sin razón" ? `\nRazón: ${reason}` : ""}`)
            .setTimestamp(),
        ],
      }).catch(() => {});

      await member.kick(`${modTag}: ${reason}`);

      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue expulsado`)
        .setColor(RED)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario expulsado")
        .setColor(RED)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: modTag,                                    inline: true },
          { name: "Razón",     value: reason,                                    inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo expulsar al usuario");
    }
  },
};

module.exports = { data };
