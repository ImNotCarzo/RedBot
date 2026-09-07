const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { RED } = require("../../../utils/colors");
const { parseDuration, formatDuration, upsertTempBan, scheduleTempUnban } = require("../../../src/moderation");
const { sendLog } = require("../../../src/guild");
const { makeSend, hierarchyChecks, modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "tempban", description: "Banea a un usuario por un tiempo determinado" }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario",  description: "Usuario a banear",            required: true })
      .addString({ name: "duracion", description: "Duración (ej: 1h, 30m, 2d)", required: true })
      .addString({ name: "razon",    description: "Razón",                        required: false }),

    plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

    async code(ctx) {
      const isSlash = !!ctx.interaction;
      if (isSlash) await ctx.interaction.deferReply();
      const send = makeSend(ctx, isSlash);

      const member   = ctx.get("usuario");
      const durStr   = ctx.get("duracion");
      const reason   = ctx.get("razon") ?? "Sin razón";
      const duration = parseDuration(durStr);
      const tag      = modTag(ctx);

      if (!duration)
        return send({ content: "Duración inválida. Usa: `30s`, `10m`, `2h`, `1d`", flags: MessageFlags.Ephemeral });
      if (duration > 28 * 86_400_000)
        return send({ content: "La duración máxima es 28 días", flags: MessageFlags.Ephemeral });

      const hierr = hierarchyChecks(ctx, member, "banear a");
      if (hierr) return send({ content: hierr, flags: MessageFlags.Ephemeral });

      try {
        const unbanAt  = new Date(Date.now() + duration);
        const username = member.user.globalName || member.user.username;

        await member.user.send({
          embeds: [new EmbedBuilder().setColor(RED)
            .setDescription(`Fuiste tempbaneado de **${ctx.guild.name}**`)
            .addFields(
              { name: "Razón",    value: reason,                   inline: true },
              { name: "Duración", value: formatDuration(duration), inline: true },
            )],
        }).catch(() => {});

        await member.ban({ reason: `[TEMPBAN ${formatDuration(duration)}] ${tag}: ${reason}` });

        await upsertTempBan({ guildId: ctx.guild.id, userId: member.id, unbanAt });
        scheduleTempUnban(ctx.guild.client, ctx.guild.id, member.id, unbanAt);

        await send({ embeds: [new EmbedBuilder()
          .setDescription(`**${username}** fue tempbaneado por **${formatDuration(duration)}**`)
          .setColor(RED)] });

        await sendLog(ctx.guild, new EmbedBuilder()
          .setTitle("Usuario tempbaneado").setColor(RED)
          .addFields(
            { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`,        inline: true },
            { name: "Moderador", value: tag,                                              inline: true },
            { name: "Duración",  value: formatDuration(duration),                         inline: true },
            { name: "Expira",    value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`, inline: true },
            { name: "Razón",     value: reason,                                           inline: false },
          ).setTimestamp()
        );
      } catch {
        await send({ content: "No pude hacer el tempban", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
