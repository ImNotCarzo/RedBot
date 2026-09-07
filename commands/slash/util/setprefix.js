const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED, GREEN } = require("../../../utils/colors");
const { getPrefix, setPrefix } = require("../../../src/guild");
const { createCommandLogger } = require("../../_shared/runtime");

const log = createCommandLogger("CMD_UTIL");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "setprefix",
      description: "Cambia o muestra el prefix del bot en este servidor",
    }),
    params: new ParamsBuilder().addString({
      name: "nuevo",
      description: "Nuevo prefix (omitir para ver el actual)",
      required: false,
    }),
    plugins: [Plugins.hasPerms("Administrator")],

    async code(ctx) {
      try {
        if (!ctx.guild)
          return ctx.send({ content: "Este comando solo funciona en servidores", flags: MessageFlags.Ephemeral });

        const nuevo = ctx.get("nuevo");

        if (!nuevo) {
          const prefix = await getPrefix(ctx.guild.id);
          return ctx.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("Prefix actual")
                .setDescription(`\`${prefix}\``)
                .setColor(RED),
            ],
          });
        }

        if (nuevo.length > 3)
          return ctx.send({ content: "El prefix no puede tener más de 3 caracteres", flags: MessageFlags.Ephemeral });

        await setPrefix(ctx.guild.id, nuevo);

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Prefix actualizado")
              .setDescription(`Nuevo prefix: \`${nuevo}\``)
              .setColor(GREEN),
          ],
        });
      } catch (err) {
        log.error("[util setprefix]", { err: err?.message ?? String(err) });
        await ctx.send({ content: "No se pudo cambiar el prefix", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
