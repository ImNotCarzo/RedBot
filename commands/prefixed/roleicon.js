const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

const data = {
  data: new CommandBuilder({
    name: "roleicon",
    description: "Muestra el icono de un rol",
    aliases: ["iconrole", "ricon"],
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
  const paramerror = new EmbedBuilder()
    .setAuthor({ name: "Comando Roleicon" })
    .setFields({
      name: "Usos:",
      value: "Muestra el icono de un rol",
    }, {
      name: "Aliases:",
      value: `\`iconrole\`, \`ricon\``,
    })
    .setDescription(`\`\`\`js\n .roleicon <@rol>>\n Ejemplo: .roleicon @gokiano\`\`\``);

  return ctx.send({ embeds: [paramerror] });
}
      if (!role.icon) return ctx.send("Este rol no tiene icono");

      const url = role.iconURL({ size: 4096, extension: "png" });

      const embed = new EmbedBuilder()
        .setAuthor({ name: role.name })
        .setTitle("Icono del rol")
        .setURL(url)
        .setImage(url)
        .setColor(role.color || "#2b2d31")
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error en roleicon:", err);
      await ctx.send("No se pudo obtener el icono del rol");
    }
  },
};

module.exports = { data };
