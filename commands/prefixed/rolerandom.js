const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "rolerandom",
    description: "Muestra un rol aleatorio del servidor",
    aliases: ["randomrole", "rrandom"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const roles = guild.roles.cache.filter(r => r.id !== guild.id);
      if (!roles.size) return ctx.send("Este servidor no tiene roles");

      const rolesArray = [...roles.values()];
      const role = rolesArray[Math.floor(Math.random() * rolesArray.length)];

      const perms = role.permissions.toArray().map(p => `\`${p}\``);
      const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "Sin color";

      const embed = new EmbedBuilder()
        .setTitle(`🎲 Rol aleatorio: ${role.name}`)
        .setColor(role.color || "#2b2d31")
        .addFields(
          {
            name: "Información",
            value:
              `> **ID:** \`${role.id}\`\n` +
              `> **Color:** \`${hex}\`\n` +
              `> **Posición:** \`${role.position}\`\n` +
              `> **Mencionable:** \`${role.mentionable}\`\n` +
              `> **Gestionado (bot):** \`${role.managed}\`\n` +
              `> **Separado:** \`${role.hoist}\``,
          },
          {
            name: `Permisos (${perms.length})`,
            value: perms.length ? perms.join(", ") : "Sin permisos",
          }
        )
        .setTimestamp();

      if (role.icon) embed.setThumbnail(role.iconURL({ size: 1024 }));

      await ctx.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error en rolerandom:", err);
      await ctx.send("No se pudo obtener un rol aleatorio");
    }
  },
};

module.exports = { data };
