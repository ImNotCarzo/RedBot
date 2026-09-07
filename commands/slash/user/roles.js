const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { ComponentType } = require("discord.js");
const { createCommandLogger, clampPage, noGuildReply } = require("../../_shared/runtime");
const { resolveMember, buildRolesEmbed, buildPaginationRow, paginateArray, uniqueId } = require("./_helpers");

const log = createCommandLogger("CMD_USER_ROLES");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "roles", description: "Muestra los roles de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        if (!ctx.guild) return noGuildReply(ctx);
        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const member = await resolveMember(ctx, input);
        if (!member) return ctx.send("No pude encontrar al usuario");

        const user = member.user;
        const allRoles = member.roles.cache
          .filter((r) => r.id !== ctx.guild.id)
          .sort((a, b) => b.position - a.position)
          .map((r) => `<@&${r.id}>`);

        if (!allRoles.length) return ctx.send("Este usuario no tiene roles");

        const pages = paginateArray(allRoles);
        let page = 0;
        const prevId = uniqueId("roles_prev");
        const nextId = uniqueId("roles_next");

        const reply = await ctx.send({
          embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
          components: pages.length > 1 ? [buildPaginationRow(prevId, nextId, page, pages.length)] : [],
        });
        if (pages.length <= 1) return;

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60_000,
          filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === invoker.id,
        });

        collector.on("collect", async (i) => {
          page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
          await i.update({
            embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
            components: [buildPaginationRow(prevId, nextId, page, pages.length)],
          });
        });

        collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
      } catch (err) {
        log.error("Error en user roles", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener los roles");
      }
    },
  },
};
