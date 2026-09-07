const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { GREEN } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { noGuildReply } = require("../../_shared/runtime");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "clone",
      description: "Clona un canal con su configuración",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a clonar (opcional, por defecto el actual)", required: false }),
    plugins: [Plugins.hasPerms("ManageChannels"), Plugins.hasBotPerms("ManageChannels")],

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      try {
        const cloned = await channel.clone({ reason: `${modTag}: channel clone` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${channel} fue clonado → ${cloned}`)
          .setColor(GREEN);

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal clonado")
          .setColor(GREEN)
          .addFields(
            { name: "Original", value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Clon", value: `${cloned} (\`${cloned.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true }
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo clonar el canal", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
