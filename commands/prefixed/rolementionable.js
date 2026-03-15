const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED, GREEN } = require("../../utils/colors");

function roleHierarchyCheck(ctx, role) {
  if (role.managed) return "No puedo editar roles gestionados por integraciones";
  if (role.id === ctx.guild.id) return "No puedo editar el rol @everyone";
  if (role.position >= ctx.guild.members.me.roles.highest.position)
    return "No puedo actuar sobre ese rol porque está por encima del mío";
  return null;
}

function resolveRole(ctx) {
  return ctx.message?.mentions?.roles?.first() ||
    (ctx.args?.[0]
      ? ctx.guild.roles.cache.get(ctx.args[0]) ||
        ctx.guild.roles.cache.find(r => r.name.toLowerCase().includes(ctx.args.join(" ").toLowerCase()))
      : null);
}

const data = {
  data: new CommandBuilder({
    name: "rolementionable",
    description: "Activa o desactiva si un rol es mencionable por todos",
    aliases: ["rolemention", "mentionrole", "rmention"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const role = resolveRole(ctx);
      if (!role) {
  const paramerror = new EmbedBuilder()
    .setAuthor({ name: "Comando Rolementionable" })
    .setFields({
      name: "Usos:",
      value: "Activa o desactiva si el rol es mencionable por todos",
    }, {
      name: "Aliases:",
      value: `\`rolemention\`, \`mentionrole\`, \`rmention\``,
    })
    .setDescription(`\`\`\`js\n .rolementionable <@rol>>\n Ejemplo: .rolementionable @gokiano\`\`\``);

  return ctx.send({ embeds: [paramerror] });
}

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tienes el permiso `ManageRoles`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tengo permiso para editar roles");

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send(hierr);

      const newMentionable = !role.mentionable;
      await role.setMentionable(newMentionable, `${modTag}: role mentionable`);

      const estado = newMentionable ? "activado" : "desactivado";

      const publicEmbed = new EmbedBuilder()
        .setDescription(`Mencionable de **${role.name}** ${estado}`)
        .setColor(newMentionable ? GREEN : RED)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Mencionable de rol actualizado")
        .setColor(newMentionable ? GREEN : RED)
        .addFields(
          { name: "Rol",       value: `${role.name} (\`${role.id}\`)`, inline: true },
          { name: "Moderador", value: modTag,                           inline: true },
          { name: "Estado",    value: estado,                           inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo cambiar la mencionabilidad del rol");
    }
  },
};

module.exports = { data };
