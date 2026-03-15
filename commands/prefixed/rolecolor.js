const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "color",
    description: "Muestra el color de un rol",
    aliases: ["colorrole", "rolecolor"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const role = ctx.message?.mentions?.roles?.first() ||
        (ctx.args?.[0] ? guild.roles.cache.get(ctx.args[0]) || guild.roles.cache.find(r => r.name.toLowerCase().includes(ctx.args.join(" ").toLowerCase())) : null);

      if (!role) {
        const bot = ctx.client.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Color", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `\`\`\`\n.color <@rol>\nEjemplo: .color @gokiano\`\`\`` +
            `\n\n**Usos:**\nMuestra el color de un rol` +
            `\n\n**Aliases:**\ncolorrole, rolecolor`
          );

        return ctx.send({ embeds: [paramerror] });
      }
      if (!role.color) return ctx.send("Este rol no tiene color asignado");

      const hex = `#${role.color.toString(16).padStart(6, "0")}`;

      const embed = new EmbedBuilder()
        .setTitle(role.name)
        .setDescription(`> **Hex:** \`${hex}\`\n> **Decimal:** \`${role.color}\``)
        .setColor(role.color)
        .setTimestamp();

      if (role.icon) embed.setThumbnail(role.iconURL({ size: 1024 }));

      await ctx.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error en rolecolor:", err);
      await ctx.send("No se pudo obtener el color del rol");
    }
  },
};

module.exports = { data };
