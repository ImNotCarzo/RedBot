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
    name: "rolehoist",
    description: "Activa o desactiva si un rol se muestra separado en la lista de miembros",
    aliases: ["hoistrole", "rhoist"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const role = resolveRole(ctx);
      if (!role) return ctx.send("Mencioná o especificá un rol");

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tienes el permiso `ManageRoles`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tengo permiso para editar roles");

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send(hierr);

      const newHoist = !role.hoist;
      await role.setHoist(newHoist, `${modTag}: role hoist`);

      const estado = newHoist ? "activado" : "desactivado";

      const publicEmbed = new EmbedBuilder()
        .setDescription(`Hoist de **${role.name}** ${estado}`)
        .setColor(newHoist ? GREEN : RED)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Hoist de rol actualizado")
        .setColor(newHoist ? GREEN : RED)
        .addFields(
          { name: "Rol",       value: `${role.name} (\`${role.id}\`)`, inline: true },
          { name: "Moderador", value: modTag,                           inline: true },
          { name: "Estado",    value: estado,                           inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo cambiar el hoist del rol");
    }
  },
};

module.exports = { data };
