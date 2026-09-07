const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { makeSend, hierarchyChecks, modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "ban", description: "Banea a un usuario del servidor" }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario a banear",                    required: true })
      .addString({ name: "razon",   description: "Razón del ban",                       required: false })
      .addString({ name: "dias",    description: "Días de mensajes a borrar (0-7)",     required: false }),
    plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

    async code(ctx) {
      const isSlash = !!ctx.interaction;
      if (isSlash) await ctx.interaction.deferReply();
      const send = makeSend(ctx, isSlash);

      const member  = ctx.get("usuario");
      const reason  = ctx.get("razon") ?? "Sin razón";
      const days    = Math.min(7, Math.max(0, parseInt(ctx.get("dias")) || 0));
      const tag     = modTag(ctx);

      const hierr = hierarchyChecks(ctx, member, "banear a");
      if (hierr) return send({ content: hierr, flags: MessageFlags.Ephemeral });

      try {
        await member.user.send({
          embeds: [new EmbedBuilder().setColor(RED).setDescription(`Fuiste baneado de **${ctx.guild.name}**\nRazón: ${reason}`)],
        }).catch(() => {});

        await member.ban({ deleteMessageSeconds: days * 86400, reason: `${tag}: ${reason}` });

        const username = member.user.globalName || member.user.username;

        await send({ embeds: [new EmbedBuilder().setDescription(`**${username}** fue baneado`).setColor(RED)] });

        await sendLog(ctx.guild, new EmbedBuilder()
          .setTitle("Usuario baneado").setColor(RED)
          .addFields(
            { name: "Usuario",           value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Moderador",         value: tag,                                      inline: true },
            { name: "Razón",             value: reason,                                   inline: false },
            { name: "Mensajes borrados", value: `${days} días`,                           inline: true },
          ).setTimestamp()
        );
      } catch {
        await send({ content: "No pude banear al usuario", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
