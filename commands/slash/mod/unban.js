const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { GREEN } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "unban", description: "Desbanea a un usuario por ID" }),
    params: new ParamsBuilder()
      .addString({ name: "id",    description: "ID del usuario",       required: true })
      .addString({ name: "razon", description: "Razón del desbaneo",   required: false }),

    plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

    async code(ctx) {
      const userId = ctx.get("id");
      const reason = ctx.get("razon") ?? "Sin razón";
      const tag    = modTag(ctx);

      try {
        const ban = await ctx.guild.bans.fetch(userId).catch(() => null);
        if (!ban) return ctx.send({ content: "Ese usuario no está baneado", flags: MessageFlags.Ephemeral });

        await ban.user.send({
          embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`Fuiste desbaneado de **${ctx.guild.name}**\nRazón: ${reason}`)],
        }).catch(() => {});

        await ctx.guild.members.unban(userId, `${tag}: ${reason}`);

        const username = ban.user.globalName || ban.user.username;

        await ctx.send({ embeds: [new EmbedBuilder().setDescription(`**${username}** fue desbaneado`).setColor(GREEN)] });

        await sendLog(ctx.guild, new EmbedBuilder()
          .setTitle("Usuario desbaneado").setColor(GREEN)
          .addFields(
            { name: "Usuario",   value: `${ban.user.tag} (\`${userId}\`)`, inline: true },
            { name: "Moderador", value: tag,                                inline: true },
            { name: "Razón",     value: reason,                             inline: false },
          ).setTimestamp()
        );
      } catch {
        await ctx.send({ content: "No se pudo desbanear al usuario, verifica que el ID sea correcto", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
