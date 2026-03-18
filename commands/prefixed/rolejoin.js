const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { GREEN, RED } = require("../../utils/colors");
const { sendLog } = require("../../utils/helpers");

function roleHierarchyCheck(ctx, role) {
  if (role.managed) return "No puedo editar roles gestionados por integraciones";
  if (role.id === ctx.guild.id) return "No puedo editar el rol @everyone";
  if (role.position >= ctx.guild.members.me.roles.highest.position)
    return "No puedo actuar sobre ese rol porque está por encima del mío";
  return null;
}

const data = {
  data: new CommandBuilder({
    name: "rolejoin",
    description: "Configura o desactiva el rol automático al entrar",
    aliases: ["joinrole", "autorole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    if (!ctx.guild) return ctx.send("Solo se puede usar en servidores");

    if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return ctx.send("Necesitás el permiso `ManageGuild`");

    const { JoinRole } = require("../../events/guildMemberAdd");

    const role = ctx.message?.mentions?.roles?.first()
      || (ctx.args?.[0] ? ctx.guild.roles.cache.get(ctx.args[0]) : null);

    if (!role) {
      const deleted = await JoinRole.findOneAndDelete({ guildId: ctx.guild.id });

      if (!deleted) {
        return ctx.send({
          embeds: [
            new EmbedBuilder()
              .setAuthor({ name: "Comando Rolejoin", iconURL: ctx.bot.user.displayAvatarURL() })
              .setDescription(
                `**Usos:**\nConfigura o desactiva el rol automático al entrar` +
                `\n\n**Aliases:**\n\`joinrole\`, \`autorole\`` +
                `\n\n\`\`\`js\n.rolejoin <@rol>   → activar\n.rolejoin          → desactivar\`\`\``
              )
              .setColor(RED),
          ],
        });
      }

      const embed = new EmbedBuilder()
        .setDescription("Rol automático al entrar desactivado")
        .setColor(RED)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
      return sendLog(ctx.guild, embed);
    }

    const hierr = roleHierarchyCheck(ctx, role);
    if (hierr) return ctx.send(hierr);

    await JoinRole.findOneAndUpdate(
      { guildId: ctx.guild.id },
      { roleId: role.id },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("Rol automático configurado")
      .setDescription(`${role} se asignará a cada usuario que entre al servidor`)
      .setColor(GREEN)
      .setTimestamp();

    await ctx.send({ embeds: [embed] });
    await sendLog(ctx.guild, new EmbedBuilder()
      .setTitle("Rol join configurado")
      .setColor(GREEN)
      .addFields(
        { name: "Rol",       value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "Moderador", value: ctx.author.tag,                   inline: true },
      )
      .setTimestamp()
    );
  },
};

module.exports = { data };
