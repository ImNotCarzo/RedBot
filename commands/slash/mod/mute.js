const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { RED } = require("../../../utils/colors");
const { parseDuration, formatDuration } = require("../../../src/moderation");
const { sendLog } = require("../../../src/guild");
const { hierarchyChecks, modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "mute", description: "Silencia a un usuario con timeout" }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario",  description: "Usuario a silenciar",            required: true })
      .addString({ name: "duracion", description: "Duración (ej: 10m, 1h, 1d)",    required: true })
      .addString({ name: "razon",    description: "Razón",                           required: false }),

    plugins: [Plugins.hasPerms("ModerateMembers"), Plugins.hasBotPerms("ModerateMembers")],

    async code(ctx) {
      const member   = ctx.get("usuario");
      const durStr   = ctx.get("duracion");
      const reason   = ctx.get("razon") ?? "Sin razón";
      const duration = parseDuration(durStr);
      const tag      = modTag(ctx);

      if (!duration)
        return ctx.send({ content: "Duración inválida. Usa: `30s`, `10m`, `2h`, `1d`", flags: MessageFlags.Ephemeral });
      if (duration > 28 * 86_400_000)
        return ctx.send({ content: "La duración máxima de timeout es 28 días", flags: MessageFlags.Ephemeral });

      const hierr = hierarchyChecks(ctx, member, "silenciar a");
      if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

      try {
        await member.timeout(duration, `${tag}: ${reason}`);

        const username = member.user.globalName || member.user.username;
        const tiempo   = formatDuration(duration);
        const expireTs = Math.floor((Date.now() + duration) / 1000);

        await ctx.send({ embeds: [new EmbedBuilder().setDescription(`**${username}** fue silenciado por **${tiempo}**`).setColor(RED)] });

        await member.user.send({
          embeds: [new EmbedBuilder().setColor(RED)
            .setDescription(`Fuiste silenciado en **${ctx.guild.name}** por **${tiempo}**`)
            .addFields({ name: "Razón", value: reason })],
        }).catch(() => {});

        await sendLog(ctx.guild, new EmbedBuilder()
          .setTitle("Usuario silenciado").setColor(RED)
          .addFields(
            { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Moderador", value: tag,                                      inline: true },
            { name: "Duración",  value: tiempo,                                   inline: true },
            { name: "Expira",    value: `<t:${expireTs}:R>`,                      inline: true },
            { name: "Razón",     value: reason,                                   inline: false },
          ).setTimestamp()
        );
      } catch {
        await ctx.send({ content: "No se pudo silenciar al usuario", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
