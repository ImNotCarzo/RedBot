const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "deny",
    description: "Quita el acceso a un usuario en un canal",
    aliases: ["chdeny", "channeldeny"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const member  = ctx.message?.mentions?.members?.first();
      const channel = ctx.message?.mentions?.channels?.first() ?? ctx.channel;

      if (!member) {
        const bot = ctx.client.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Deny", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `\`\`\`\n.deny <@usuario> /canalOpcional/\nEjemplo: .deny @loge #uxiono\`\`\`` +
            `\n\n**Usos:**\nQuita el acceso a un usuario en un canal` +
            `\n\n**Aliases:**\nchdeny, channeldeny`
          );

        return ctx.send({ embeds: [paramerror] });
      }

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tienes el permiso `ManageChannels`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tengo permiso para editar canales");

      await channel.permissionOverwrites.edit(member, {
        ViewChannel:  false,
        SendMessages: false,
      }, { reason: `${modTag}: channel deny` });

      const publicEmbed = new EmbedBuilder()
        .setDescription(`${member} ya no tiene acceso a ${channel}`)
        .setColor(RED)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Acceso denegado")
        .setColor(RED)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Canal",     value: `${channel} (\`${channel.id}\`)`,        inline: true },
          { name: "Moderador", value: modTag,                                   inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo quitar el acceso al usuario");
    }
  },
};

module.exports = { data };
