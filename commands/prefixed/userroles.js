const { CommandBuilder } = require("erine");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");

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

function buildRolesEmbed(member, user, usernameDisplay, roles, page, totalPages) {
  return new EmbedBuilder()
    .setAuthor({ name: usernameDisplay, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(roles.join("\n"))
    .setColor(member.displayHexColor || "#2b2d31")
    .setFooter({ text: `Página ${page + 1}/${totalPages} • ${member.roles.cache.size - 1} roles en total` })
    .setTimestamp();
}

const data = {
  data: new CommandBuilder({
    name: "uroles",
    description: "Muestra los roles de un usuario",
    aliases: ["useroles"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const input = ctx.args?.join(" ").trim() || null;
      const invoker = ctx.author;
      const member = await resolveMember(ctx, input);
      if (!member) return ctx.send("No pude encontrar al usuario");

      const user = member.user;
      const usernameDisplay = member.nickname ? `${user.username} (${member.nickname})` : user.username;

      const allRoles = member.roles.cache
        .filter((r) => r.id !== ctx.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => `<@&${r.id}>`);

      if (!allRoles.length) return ctx.send("Este usuario no tiene roles");

      const pages = [];
      for (let i = 0; i < allRoles.length; i += 15) pages.push(allRoles.slice(i, i + 15));
      let page = 0;

      const prevId = `roles_prev_${Date.now()}`;
      const nextId = `roles_next_${Date.now()}`;

      const buildPaginationRow = (p) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
          new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(p === pages.length - 1)
        );

      const reply = await ctx.send({
        embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)],
        components: pages.length > 1 ? [buildPaginationRow(page)] : [],
      });

      if (pages.length <= 1) return;

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60 * 1000,
        filter: (i) => i.user.id === invoker.id && [prevId, nextId].includes(i.customId),
      });

      collector.on("collect", async (i) => {
        if (i.customId === prevId) page--;
        if (i.customId === nextId) page++;
        await i.update({
          embeds: [buildRolesEmbed(member, user, usernameDisplay, pages[page], page, pages.length)],
          components: [buildPaginationRow(page)],
        });
      });

      collector.on("end", async () => {
        await reply.edit({ components: [] }).catch(() => {});
      });

    } catch (err) {
      console.error("Error en uroles:", err);
      await ctx.send("No se pudo obtener los roles");
    }
  },
};

module.exports = { data };