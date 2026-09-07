const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { noGuildReply } = require("../../_shared/runtime");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "deny",
      description: "Quita el acceso a un usuario en un canal",
    }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario", required: true })
      .addChannel({ name: "canal", description: "Canal objetivo (opcional, por defecto el actual)", required: false }),
    plugins: [Plugins.hasPerms("ManageChannels"), Plugins.hasBotPerms("ManageChannels")],

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);
      const member = ctx.get("usuario");
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      try {
        await channel.permissionOverwrites.edit(member, {
          ViewChannel: false,
          SendMessages: false,
        }, { reason: `${modTag}: channel deny` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${member} ya no tiene acceso a ${channel}`)
          .setColor(RED);

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Acceso denegado")
          .setColor(RED)
          .addFields(
            { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true }
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo quitar el acceso al usuario", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
