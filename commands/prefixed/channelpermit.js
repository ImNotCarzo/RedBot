const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { GREEN } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "permit",
    description: "Da acceso a un usuario en un canal",
    aliases: ["chpermit", "channelpermit"],
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
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Permit", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `\`\`\`js\n.permit <@usuario> /canalOpcional/\nEjemplo: .permit @loge #uxiono\`\`\`` +
            `\n\n**Usos:**\nDa acceso a un usuario en un canal` +
            `\n\n**Aliases:**\nchpermit, channelpermit`
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      }

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tienes el permiso `ManageChannels`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tengo permiso para editar canales");

      await channel.permissionOverwrites.edit(member, {
        ViewChannel:  true,
        SendMessages: true,
      }, { reason: `${modTag}: channel permit` });

      const publicEmbed = new EmbedBuilder()
        .setDescription(`${member} ahora tiene acceso a ${channel}`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Acceso concedido")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Canal",     value: `${channel} (\`${channel.id}\`)`,        inline: true },
          { name: "Moderador", value: modTag,                                   inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo dar acceso al usuario");
    }
  },
};

module.exports = { data };
