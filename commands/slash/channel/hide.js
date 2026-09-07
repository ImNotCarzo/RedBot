const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { noGuildReply } = require("../../_shared/runtime");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "hide",
      description: "Oculta un canal a @everyone",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a ocultar (opcional, por defecto el actual)", required: false }),
    plugins: [Plugins.hasPerms("ManageChannels"), Plugins.hasBotPerms("ManageChannels")],

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      try {
        await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, {
          ViewChannel: false,
        }, { reason: `${modTag}: channel hide` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${channel} fue ocultado`)
          .setColor(RED);

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal ocultado")
          .setColor(RED)
          .addFields(
            { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true }
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo ocultar el canal", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
