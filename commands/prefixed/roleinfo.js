const { CommandBuilder } = require("erine");
const {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const { RED } = require("../../utils/colors");

const buildRoleEmbed = (role) => {
  const perms = role.permissions.toArray().map(p => `\`${p}\``);
  const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "Sin color";
  const embed = new EmbedBuilder()
    .setTitle(role.name)
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
  return embed;
};

const data = {
  data: new CommandBuilder({
    name: "role",
    description: "Muestra información de un rol",
    aliases: ["roleinfo", "inforole"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.message?.mentions?.roles?.first() ||
        (ctx.args?.[0] ? guild.roles.cache.get(ctx.args[0]) || guild.roles.cache.find(r => r.name.toLowerCase().includes(ctx.args.join(" ").toLowerCase())) : null);

      if (!input) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Roleinfo", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `\`\`\`js\n.roleinfo <@rol>\nEjemplo: .roleinfo @gokiano\`\`\`` +
            `\n\n**Usos:**\nMuestra información de un rol` +
            `\n\n**Aliases:**\nroleinfo, inforole`
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      }
      const selectRoles = guild.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .first(25);

      const selectId = `role_select_${Date.now()}`;
      const authorId = ctx.author.id;

      const components = selectRoles.size > 1
        ? [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(selectId)
              .setPlaceholder("Seleccionar otro rol...")
              .addOptions(
                selectRoles.map(r =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(r.name.slice(0, 100))
                    .setValue(r.id)
                )
              )
          )]
        : [];

      const msg = await ctx.send({ embeds: [buildRoleEmbed(input)], components });
      if (!components.length) return;

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 5 * 60 * 1000,
        filter: (i) => i.customId === selectId,
      });

      collector.on("collect", async (i) => {
        const newRole = guild.roles.cache.get(i.values[0]);
        if (!newRole) return i.reply({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });
        if (i.user.id !== authorId) return i.reply({ embeds: [buildRoleEmbed(newRole)], flags: MessageFlags.Ephemeral });
        await i.update({ embeds: [buildRoleEmbed(newRole)] });
      });

      collector.on("end", async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });

    } catch (err) {
      console.error("Error en roleinfo:", err);
      await ctx.send("No se pudo obtener la información del rol");
    }
  },
};

module.exports = { data };
