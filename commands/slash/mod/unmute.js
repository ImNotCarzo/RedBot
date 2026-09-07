const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { GREEN } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "unmute", description: "Quita el timeout a un usuario" }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario a desmutear", required: true })
      .addString({ name: "razon",   description: "Razón",               required: false }),

    plugins: [Plugins.hasPerms("ModerateMembers"), Plugins.hasBotPerms("ModerateMembers")],

    async code(ctx) {
      const member = ctx.get("usuario");
      const reason = ctx.get("razon") ?? "Sin razón";
      const tag    = modTag(ctx);
      if (!member.communicationDisabledUntil)
        return ctx.send({ content: "Ese usuario no está silenciado", flags: MessageFlags.Ephemeral });

      try {
        await member.timeout(null, `${tag}: ${reason}`);

        const username = member.user.globalName || member.user.username;

        await ctx.send({ embeds: [new EmbedBuilder().setDescription(`El mute de **${username}** fue removido`).setColor(GREEN)] });

        await member.user.send({
          embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`Tu silencio en **${ctx.guild.name}** fue removido`)],
        }).catch(() => {});

        await sendLog(ctx.guild, new EmbedBuilder()
          .setTitle("Silencio removido").setColor(GREEN)
          .addFields(
            { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Moderador", value: tag,                                      inline: true },
            { name: "Razón",     value: reason,                                   inline: false },
          ).setTimestamp()
        );
      } catch {
        await ctx.send({ content: "No se pudo quitar el timeout", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
