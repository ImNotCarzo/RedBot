const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { DARK, RED } = require("../../utils/colors");

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
    name: "rolerename",
    description: "Renombra un rol",
    aliases: ["renamerole", "rrename"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const role = resolveRole(ctx);
      if (!role) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Rolerename", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nRenombra un rol` +
            `\n\n**Aliases:**\n\`renamerole\`, \`rrename\`` +
            `\n\n\`\`\`js\n.rolerename <@rol> <nuevoNombre>\nEjemplo: .rolerename @gokiano potatiano\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      }

      // El nuevo nombre es todo lo que sigue después del rol (o ID)
      const mentionUsed = ctx.message?.mentions?.roles?.size > 0;
      const newName = mentionUsed
        ? ctx.args?.join(" ").replace(/<@&\d+>/g, "").trim()
        : ctx.args?.slice(1).join(" ").trim();

      if (!newName) return ctx.send("Proporciona el nuevo nombre del rol");

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tienes el permiso `ManageRoles`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send("No tengo permiso para editar roles");

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send(hierr);

      const oldName = role.name;
      await role.setName(newName.slice(0, 100), `${modTag}: role rename`);

      const publicEmbed = new EmbedBuilder()
        .setTitle("Rol renombrado")
        .setColor(role.color || DARK)
        .addFields(
          { name: "Antes", value: `\`${oldName}\``, inline: true },
          { name: "Ahora", value: `\`${newName}\``, inline: true },
        )
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Rol renombrado")
        .setColor(role.color || DARK)
        .addFields(
          { name: "Rol",       value: `\`${role.id}\``,  inline: true },
          { name: "Moderador", value: modTag,             inline: true },
          { name: "Antes",     value: `\`${oldName}\``,  inline: true },
          { name: "Ahora",     value: `\`${newName}\``,  inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo renombrar el rol");
    }
  },
};

module.exports = { data };
