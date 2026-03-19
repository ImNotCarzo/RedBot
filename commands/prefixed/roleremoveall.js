const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { GREEN, RED } = require("../../utils/colors");
const sendLog = require("../../utils/sendLog");

function roleHierarchyCheck(ctx, role) {
  if (role.managed) return "No puedo editar roles gestionados por integraciones";
  if (role.id === ctx.guild.id) return "No puedo editar el rol @everyone";
  if (role.position >= ctx.guild.members.me.roles.highest.position)
    return "No puedo actuar sobre ese rol porque está por encima del mío";
  return null;
}

const data = {
  data: new CommandBuilder({
    name: "roleremoveall",
    description: "Quita un rol a todos los miembros que lo tengan",
    aliases: ["removeroleall", "removeallrole", "rremoveall"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    if (!ctx.guild) return ctx.send("Solo se puede usar en servidores");

    const role = ctx.message?.mentions?.roles?.first()
      || (ctx.args?.[0] ? ctx.guild.roles.cache.get(ctx.args[0]) : null);

    if (!role) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando Roleremoveall", iconURL: ctx.bot.user.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nQuita un rol a todos los miembros que lo tengan` +
              `\n\n**Aliases:**\n\`removeroleall\`, \`removeallrole\`` +
              `\n\n\`\`\`js\n.roleremoveall <@rol> [bots]\nEjemplo: .roleremoveall @miembro\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
      return ctx.send("Necesitas el permiso `Administrator`");

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return ctx.send("No tengo permiso para gestionar roles");

    const hierr = roleHierarchyCheck(ctx, role);
    if (hierr) return ctx.send(hierr);

    const incluirBots = ctx.args?.includes("bots");
    const modTag = ctx.author.tag;

    if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
      await ctx.guild.members.fetch().catch(() => {});
    }

    const targets = ctx.guild.members.cache.filter(m =>
      m.roles.cache.has(role.id) && (incluirBots ? true : !m.user.bot)
    );

    if (!targets.size)
      return ctx.send(`Nadie tiene el rol ${role}`);

    try {
      let done = 0;
      let failed = 0;

      for (const [, member] of targets) {
        try {
          await member.roles.remove(role, `${modTag}: roleremoveall`);
          done++;
        } catch {
          failed++;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("Roleremoveall completado")
        .setColor(RED)
        .addFields(
          { name: "Rol",      value: role.name,    inline: true },
          { name: "Quitados", value: `${done}`,    inline: true },
          { name: "Fallidos", value: `${failed}`,  inline: true },
          { name: "Bots",     value: incluirBots ? "Sí" : "No", inline: true },
        )
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
      await sendLog(ctx.guild, embed);
    } catch (err) {
      console.error("[roleremoveall]", err);
      await ctx.send("No se pudo completar la operación");
    }
  },
};

module.exports = { data };
