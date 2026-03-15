const { CommandBuilder } = require("erine");
const { PermissionFlagsBits } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "roleadd",
    description: "Añade un rol a un usuario",
    aliases: ["addrole", "radd"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const member = ctx.message?.mentions?.members?.first();
      const role = ctx.message?.mentions?.roles?.first();

      if (!member || !role) {
  const paramerror = new EmbedBuilder()
    .setAuthor({ name: "Comando Roleadd" })
    .setFields({
      name: "Usos:",
      value: "Añade un rol a un usuario",
    }, {
      name: "Aliases:",
      value: `\`addrole\`, \`radd\``,
    })
    .setDescription(`\`\`\`js\n .roleadd <@usuario> <@rol>>\n Ejemplo: .roleadd @loge @gokiano\`\`\``);

  return ctx.send({ embeds: [paramerror] });
}

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tienes el permiso `ManageRoles` para usar esto");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tengo permiso para asignar roles");

      if (role.position >= guild.members.me.roles.highest.position)
        return ctx.send("No puedo asignar ese rol porque está por encima del mío");

      if (member.roles.cache.has(role.id))
        return ctx.send(`${member} ya tiene el rol ${role}`);

      await member.roles.add(role);
      await ctx.send(`El rol ${role} fue añadido a ${member}`);

    } catch {
      await ctx.send("No se pudo asignar el rol");
    }
  },
};

module.exports = { data };
