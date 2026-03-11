const { CommandBuilder } = require("erine");
const { PermissionFlagsBits } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "roleremove",
    description: "Quita un rol a un usuario",
    aliases: ["removerole", "rremove"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const member = ctx.message?.mentions?.members?.first();
      const role = ctx.message?.mentions?.roles?.first();

      if (!member || !role) return ctx.send("Uso: `.roleremove @usuario @rol`");

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tenés el permiso `ManageRoles` para usar esto");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tengo permiso para quitar roles");

      if (role.position >= guild.members.me.roles.highest.position)
        return ctx.send("No puedo quitar ese rol porque está por encima del mío");

      if (!member.roles.cache.has(role.id))
        return ctx.send(`${member} no tiene el rol ${role}`);

      await member.roles.remove(role);
      await ctx.send(`El rol ${role} fue removido de ${member}`);

    } catch {
      await ctx.send("No se pudo quitar el rol");
    }
  },
};

module.exports = { data };