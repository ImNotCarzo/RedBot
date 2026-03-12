const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");

async function resolveMember(ctx, input) {
  if (!input) return ctx.member ?? null;
  if (typeof input === "object") return input;
  if (ctx.message?.mentions?.members?.size) return ctx.message.mentions.members.first();
  if (/^\d{17,20}$/.test(input)) {
    const byId = await ctx.guild.members.fetch(input).catch(() => null);
    if (byId) return byId;
  }
  const results = await ctx.guild.members.fetch({ query: input, limit: 1 }).catch(() => null);
  if (results?.size) return results.first();
  const lower = input.toLowerCase();
  return ctx.guild.members.cache.find((m) => {
    const username = m.user.username?.toLowerCase() ?? "";
    const globalName = m.user.globalName?.toLowerCase() ?? "";
    const nickname = m.nickname?.toLowerCase() ?? "";
    return username.includes(lower) || globalName.includes(lower) || nickname.includes(lower);
  }) ?? null;
}

const data = {
  data: new CommandBuilder({
    name: "userperms",
    description: "Muestra los permisos de un usuario en el servidor",
    aliases: ["perms", "permissions", "uperms"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.join(" ").trim() || null;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("No se encontró al usuario");

      const user = member.user;
      const usernameDisplay = member.nickname
        ? `${user.username} (${member.nickname})`
        : user.username;

      const perms = member.permissions
        .toArray()
        .sort()
        .map(p => `\`${p.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim()}\``);

      if (!perms.length) return ctx.send("Este usuario no tiene permisos");

      const embed = new EmbedBuilder()
        .setTitle(`Permisos de ${usernameDisplay}`)
        .setDescription(perms.join(", "))
        .setColor(member.displayHexColor || "#2b2d31")
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error en userperms:", err);
      await ctx.send("No se pudieron obtener los permisos");
    }
  },
};

module.exports = { data };
