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
    name: "rolehumans",
    description: "Añade o quita un rol a todos los usuarios (sin bots)",
    aliases: ["humansrole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    if (!ctx.guild) return ctx.send("Solo se puede usar en servidores");

    const role = ctx.message?.mentions?.roles?.first()
      || (ctx.args?.[0] ? ctx.guild.roles.cache.get(ctx.args[0]) : null);

    const accionArg = ctx.args?.find(a => ["add", "remove", "añadir", "quitar"].includes(a.toLowerCase()));
    const accion    = ["add", "añadir"].includes(accionArg?.toLowerCase()) ? "add" : "remove";

    if (!role) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Rolehumans", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nAñade o quita un rol a todos los usuarios` +
              `\n\n**Aliases:**\n\`humansrole\`` +
              `\n\n\`\`\`js\n.rolehumans <@rol> <add|remove>\nEjemplo: .rolehumans @miembro add\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
      return ctx.send("Necesitás el permiso `Administrator`");

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return ctx.send("No tengo permiso para gestionar roles");

    const hierr = roleHierarchyCheck(ctx, role);
    if (hierr) return ctx.send(hierr);

    const modTag = ctx.author.tag;

    if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
      await ctx.guild.members.fetch().catch(() => {});
    }

    const targets = ctx.guild.members.cache.filter(m =>
      !m.user.bot &&
      (accion === "add" ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id))
    );

    if (!targets.size)
      return ctx.send(`No hay usuarios a los que ${accion === "add" ? "añadir" : "quitar"} el rol ${role}`);

    try {
      let done = 0;
      let failed = 0;
      const color = accion === "add" ? GREEN : RED;

      for (const [, member] of targets) {
        try {
          accion === "add"
            ? await member.roles.add(role, `${modTag}: rolehumans`)
            : await member.roles.remove(role, `${modTag}: rolehumans`);
          done++;
        } catch {
          failed++;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("Rolehumans completado")
        .setColor(color)
        .addFields(
          { name: "Rol",                                          value: role.name,  inline: true },
          { name: accion === "add" ? "Añadidos" : "Quitados",    value: `${done}`,  inline: true },
          { name: "Fallidos",                                     value: `${failed}`, inline: true },
        )
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
      await sendLog(ctx.guild, embed);
    } catch (err) {
      console.error("[rolehumans]", err);
      await ctx.send("No se pudo completar la operación");
    }
  },
};

module.exports = { data };
