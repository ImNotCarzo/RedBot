const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { ComponentType } = require("discord.js");
const { createCommandLogger, clampPage, noGuildReply } = require("../../_shared/runtime");
const { resolveMember, buildPermsEmbed, buildPaginationRow, formatPermName, paginateArray, uniqueId } = require("./_helpers");

const log = createCommandLogger("CMD_USER_PERMS");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "permissions", description: "Muestra los permisos de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        if (!ctx.guild) return noGuildReply(ctx);
        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const member = await resolveMember(ctx, input);
        if (!member) return ctx.send("No pude encontrar al usuario");

        const user = member.user;
        const color = member.displayHexColor || "#2b2d31";
        const perms = member.permissions.toArray().sort().map(formatPermName);

        if (!perms.length) return ctx.send("Este usuario no tiene permisos");

        const pages = paginateArray(perms);
        let page = 0;
        const prevId = uniqueId("perms_prev");
        const nextId = uniqueId("perms_next");

        const reply = await ctx.send({
          embeds: [buildPermsEmbed(user, pages[page], page, pages.length, color)],
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
            embeds: [buildPermsEmbed(user, pages[page], page, pages.length, color)],
            components: [buildPaginationRow(prevId, nextId, page, pages.length)],
          });
        });

        collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
      } catch (err) {
        log.error("Error en user permissions", { err: err?.message ?? String(err) });
        await ctx.send("No se pudieron obtener los permisos del usuario");
      }
    },
  },
};
