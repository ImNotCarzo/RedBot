const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { GREEN } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { noGuildReply } = require("../../_shared/runtime");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "rename",
      description: "Renombra un canal",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a renombrar", required: true })
      .addString({ name: "nombre", description: "Nombre nuevo", required: true }),
    plugins: [Plugins.hasPerms("ManageChannels"), Plugins.hasBotPerms("ManageChannels")],

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);
      const channel = ctx.get("canal");
      const newName = ctx.get("nombre").toLowerCase().replace(/\s+/g, "-").slice(0, 100);
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      try {
        const oldName = channel.name;
        await channel.setName(newName, `${modTag}: channel rename`);

        const publicEmbed = new EmbedBuilder()
          .setTitle("Canal renombrado")
          .setColor(GREEN)
          .addFields(
            { name: "Antes", value: `\`${oldName}\``, inline: true },
            { name: "Ahora", value: `\`${newName}\``, inline: true }
          )
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal renombrado")
          .setColor(GREEN)
          .addFields(
            { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true },
            { name: "Antes", value: `\`${oldName}\``, inline: true },
            { name: "Ahora", value: `\`${newName}\``, inline: true }
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo renombrar el canal", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
