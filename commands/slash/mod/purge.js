const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { GREEN } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "purge", description: "Elimina mensajes del canal" }),
    params: new ParamsBuilder()
      .addString({ name: "cantidad", description: "Mensajes a borrar (1-100)",          required: true })
      .addMember({ name: "usuario",  description: "Filtrar por usuario (opcional)",      required: false }),

    plugins: [Plugins.hasPerms("ManageMessages"), Plugins.hasBotPerms("ManageMessages")],

    async code(ctx) {
      const amount = Math.min(100, Math.max(1, parseInt(ctx.get("cantidad")) || 0));
      const target = ctx.get("usuario") ?? null;
      const tag    = modTag(ctx);

      if (!amount)
        return ctx.send({ content: "Ingresa un número válido entre 1 y 100", flags: MessageFlags.Ephemeral });

      try {
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const fetched     = await ctx.channel.messages.fetch({ limit: 100 });
        const toDelete    = fetched
          .filter(m => m.createdTimestamp > twoWeeksAgo && (!target || m.author.id === target.id))
          .first(amount);

        if (!toDelete.length)
          return ctx.send({ content: "No hay mensajes recientes para borrar", flags: MessageFlags.Ephemeral });

        const deleted  = await ctx.channel.bulkDelete(toDelete, true);
        const cantidad = deleted.size;
        const texto    = target
          ? `Se eliminaron **${cantidad}** mensaje${cantidad !== 1 ? "s" : ""} de **${target.user.globalName || target.user.username}**`
          : `Se eliminaron **${cantidad}** mensaje${cantidad !== 1 ? "s" : ""}`;

        const reply = await ctx.send({ embeds: [new EmbedBuilder().setDescription(texto).setColor(GREEN).setTimestamp()] });

        await sendLog(ctx.guild, new EmbedBuilder()
          .setTitle("Purge ejecutado").setColor(GREEN)
          .addFields(
            { name: "Canal",               value: `${ctx.channel}`,                                               inline: true },
            { name: "Mensajes eliminados", value: `${cantidad}`,                                                   inline: true },
            { name: "Moderador",           value: tag,                                                             inline: true },
            { name: "Filtro",              value: target ? `${target.user.tag} (\`${target.id}\`)` : "Ninguno",   inline: false },
          ).setTimestamp()
        );

        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {
        await ctx.send({ content: "No pude eliminar los mensajes — pueden ser demasiado antiguos", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
