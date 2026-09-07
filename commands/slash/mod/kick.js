const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { makeSend, hierarchyChecks, modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "kick", description: "Expulsa a un usuario del servidor" }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario a expulsar", required: true })
      .addString({ name: "razon",   description: "Razón",              required: false }),

    plugins: [Plugins.hasPerms("KickMembers"), Plugins.hasBotPerms("KickMembers")],

    async code(ctx) {
      const isSlash = !!ctx.interaction;
      if (isSlash) await ctx.interaction.deferReply();
      const send = makeSend(ctx, isSlash);

      const member = ctx.get("usuario");
      const reason = ctx.get("razon") ?? "Sin razón";
      const tag    = modTag(ctx);

      const hierr = hierarchyChecks(ctx, member, "expulsar a");
      if (hierr) return send({ content: hierr, flags: MessageFlags.Ephemeral });

      try {
        await member.user.send({
          embeds: [new EmbedBuilder().setColor(RED).setDescription(`Fuiste expulsado de **${ctx.guild.name}**\nRazón: ${reason}`)],
        }).catch(() => {});

        await member.kick(`${tag}: ${reason}`);

        const username = member.user.globalName || member.user.username;

        await send({ embeds: [new EmbedBuilder().setDescription(`**${username}** fue expulsado`).setColor(RED)] });

        await sendLog(ctx.guild, new EmbedBuilder()
          .setTitle("Usuario expulsado").setColor(RED)
          .addFields(
            { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Moderador", value: tag,                                      inline: true },
            { name: "Razón",     value: reason,                                   inline: false },
          ).setTimestamp()
        );
      } catch {
        await send({ content: "No se pudo expulsar al usuario", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
