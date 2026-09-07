const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { makeSend, modTag } = require("./_helpers");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "massban", description: "Banea hasta 5 usuarios seleccionados" }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario1", description: "Usuario 1", required: true })
      .addMember({ name: "usuario2", description: "Usuario 2", required: false })
      .addMember({ name: "usuario3", description: "Usuario 3", required: false })
      .addMember({ name: "usuario4", description: "Usuario 4", required: false })
      .addMember({ name: "usuario5", description: "Usuario 5", required: false })
      .addString({ name: "razon",    description: "Razón",     required: false }),

    plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

    async code(ctx) {
      const isSlash = !!ctx.interaction;
      if (isSlash) await ctx.interaction.deferReply();
      const send = makeSend(ctx, isSlash);

      const users = [1, 2, 3, 4, 5].map(i => ctx.get(`usuario${i}`)).filter(Boolean);
      const reason = ctx.get("razon") ?? "Sin razón";
      const tag    = modTag(ctx);

      if (!users.length)
        return send({ content: "Debes seleccionar al menos un usuario", flags: MessageFlags.Ephemeral });

      const banned = [];
      const failed = [];

      for (const member of users) {
        try {
          await member.user.send({
            embeds: [new EmbedBuilder().setColor(RED).setDescription(`Fuiste baneado de **${ctx.guild.name}**\nRazón: ${reason}`)],
          }).catch(() => {});

          await ctx.guild.members.ban(member, { reason: `[MASSBAN] ${tag}: ${reason}` });
          banned.push(member);
        } catch {
          failed.push(member);
        }
      }

      const desc = banned.map((m, i) => `${i + 1}. ${m.user.tag}`).join("\n") || "Ninguno";

      await send({ embeds: [new EmbedBuilder()
        .setTitle("Usuarios baneados")
        .setDescription(`Los siguientes usuarios fueron baneados:\n${desc}`)
        .setColor(RED)] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Massban ejecutado").setColor(RED)
        .addFields(
          { name: "Moderador", value: tag,                inline: true },
          { name: "Baneados",  value: `${banned.length}`, inline: true },
          { name: "Fallidos",  value: `${failed.length}`, inline: true },
          { name: "Razón",     value: reason,             inline: false },
        ).setTimestamp();

      if (failed.length)
        logEmbed.addFields({ name: "No se pudo banear a", value: failed.map(m => m.user.tag).join(", ") });

      await sendLog(ctx.guild, logEmbed);
    },
  },
};
