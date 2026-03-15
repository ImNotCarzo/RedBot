const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { GREEN } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "purge",
    description: "Elimina mensajes del canal",
    aliases: ["modpurge", "clear", "prune"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const amountRaw = ctx.args?.[0];
      const amount = Math.min(100, Math.max(1, parseInt(amountRaw) || 0));

      if (!amount) {
        const bot = ctx.client.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Purge", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `\`\`\`\n.purge <cantidad> /usuarioOpcional/\nEjemplo: .purge 10 @loge\`\`\`` +
            `\n\n**Usos:**\nElimina mensajes de un canal` +
            `\n\n**Aliases:**\nmodpurge, clear, prune`
          );

        return ctx.send({ embeds: [paramerror] });
      }

      const target = ctx.message?.mentions?.members?.first() ?? null;
      const modTag = ctx.author?.tag ?? ctx.author?.username;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return ctx.send("No tienes el permiso `ManageMessages`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages))
        return ctx.send("No tengo permiso para eliminar mensajes");

      const fetched = await ctx.channel.messages.fetch({ limit: 100 });
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

      const toDelete = fetched
        .filter(m => m.createdTimestamp > twoWeeksAgo)
        .filter(m => !target || m.author.id === target.id)
        .first(amount);

      if (!toDelete.length) return ctx.send("No hay mensajes recientes para borrar");

      const deleted = await ctx.channel.bulkDelete(toDelete, true);
      const cantidad = deleted.size;
      const verbo = cantidad === 1 ? "Se eliminó" : "Se eliminaron";
      const palabra = cantidad === 1 ? "mensaje" : "mensajes";

      const username = target ? (target.user.globalName || target.user.username) : null;
      const texto = target
        ? `${verbo} **${cantidad}** ${palabra} de **${username}**`
        : `${verbo} **${cantidad}** ${palabra}`;

      const embed = new EmbedBuilder()
        .setDescription(texto)
        .setColor(GREEN)
        .setTimestamp();

      const reply = await ctx.send({ embeds: [embed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Purge ejecutado")
        .setColor(GREEN)
        .addFields(
          { name: "Canal",              value: `${ctx.channel}`,                                              inline: true },
          { name: "Mensajes eliminados", value: `${cantidad}`,                                                 inline: true },
          { name: "Moderador",          value: modTag,                                                        inline: true },
          { name: "Filtro de usuario",  value: target ? `${target.user.tag} (\`${target.id}\`)` : "Ninguno", inline: false },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch {
      await ctx.send("No se pudieron eliminar los mensajes");
    }
  },
};

module.exports = { data };
