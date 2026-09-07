const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { YELLOW } = require("../../../utils/colors");
const { generateId, addWarn } = require("../../../src/moderation");
const { sendLog } = require("../../../src/guild");
const { modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "warn", description: "Advierte a un usuario" }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario a advertir", required: true })
      .addString({ name: "razon",   description: "Razón",              required: true }),

    plugins: [Plugins.hasPerms("ModerateMembers")],

    async code(ctx) {
      const member = ctx.get("usuario");
      const reason = ctx.get("razon");
      const tag    = modTag(ctx);
      if (member.user.bot)
        return ctx.send({ content: "No puedes advertir a un bot", flags: MessageFlags.Ephemeral });
      if (member.roles.highest.position >= ctx.member.roles.highest.position)
        return ctx.send({ content: "No puedes advertir a alguien con igual o mayor rango que el tuyo", flags: MessageFlags.Ephemeral });

      try {
        const warnId  = generateId();
        const { total } = await addWarn({
          guildId: ctx.guild.id,
          userId: member.id,
          moderatorId: ctx.user?.id ?? ctx.author?.id,
          reason,
          warnId,
        });
        const username = member.user.globalName || member.user.username;

        await ctx.send({ embeds: [new EmbedBuilder().setDescription(`**${username}** fue advertido`).setColor(YELLOW)] });

        await sendLog(ctx.guild, new EmbedBuilder()
          .setTitle("Usuario Advertido").setColor(YELLOW)
          .addFields(
            { name: "Usuario",      value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Moderador",    value: tag,                                      inline: true },
            { name: "ID",           value: `\`${warnId}\``,                          inline: true },
            { name: "Total warns",  value: `${total}`,                               inline: true },
            { name: "Razón",        value: reason,                                   inline: false },
          ).setTimestamp()
        );

        await member.user.send({
          embeds: [new EmbedBuilder()
            .setDescription(`Fuiste advertido en **${ctx.guild.name}**`)
            .setColor(YELLOW)
            .addFields(
              { name: "Razón",       value: reason },
              { name: "Total warns", value: `${total}`, inline: true },
              { name: "ID",          value: `\`${warnId}\``, inline: true },
            )],
        }).catch(() => {});
      } catch {
        await ctx.send({ content: "No se pudo registrar la advertencia", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
