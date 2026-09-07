const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { noGuildReply } = require("../../_shared/runtime");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "lock",
      description: "Bloquea un canal para usuarios normales",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a bloquear (opcional, por defecto el actual)", required: false }),
    plugins: [Plugins.hasPerms("ManageChannels"), Plugins.hasBotPerms("ManageChannels")],

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      try {
        await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, {
          SendMessages: false,
        }, { reason: `${modTag}: channel lock` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`**${channel} fue cerrado**`)
          .setColor(RED);

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal bloqueado")
          .setColor(RED)
          .addFields(
            { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true }
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo bloquear el canal", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
