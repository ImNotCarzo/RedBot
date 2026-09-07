const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { createCommandLogger, noGuildReply } = require("../../_shared/runtime");

const log = createCommandLogger("CMD_CHANNEL_NUKE");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "nuke",
      description: "Recrea el canal borrando todos sus mensajes",
    }),
    params: new ParamsBuilder().addChannel({
      name: "canal",
      description: "Canal a nukear (opcional, por defecto el actual)",
      required: false,
    }),
    plugins: [Plugins.hasPerms("Administrator"), Plugins.hasBotPerms("ManageChannels")],

    async code(ctx) {
      const channel = ctx.get("canal") ?? ctx.channel;
      const guild = ctx.guild;
      const modTag = ctx.user?.tag ?? ctx.author?.tag;
      const authorId = ctx.user?.id ?? ctx.author?.id;

      if (!guild) return noGuildReply(ctx);
      if (!channel) {
        return ctx.send({ content: "No se pudo obtener el canal", flags: MessageFlags.Ephemeral });
      }

      const confirmId = `nuke_confirm_${Date.now()}`;
      const cancelId = `nuke_cancel_${Date.now()}`;

      const confirmEmbed = new EmbedBuilder()
        .setTitle("¿Estás seguro?")
        .setDescription("Al confirmar esta acción, el canal será **borrado** y posteriormente clonado con los mismos permisos")
        .setColor(RED)
        .setFooter({ text: "Todos los mensajes se borrarán" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel("Confirmar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(cancelId).setLabel("Cancelar").setStyle(ButtonStyle.Secondary)
      );

      const msg = await ctx.send({
        embeds: [confirmEmbed],
        components: [row],
      });

      const collector = msg.createMessageComponentCollector({
        time: 5 * 60 * 1000,
        filter: (i) => [confirmId, cancelId].includes(i.customId),
      });

      collector.on("collect", async (interaction) => {
        if (interaction.user.id !== authorId) {
          return interaction.reply({
            content: "No puedes usar estos botones",
            flags: MessageFlags.Ephemeral,
          });
        }

        if (interaction.customId === cancelId) {
          collector.stop();

          return interaction.update({
            embeds: [new EmbedBuilder().setDescription("Nuke cancelado").setColor(RED)],
            components: [],
          });
        }

        if (interaction.customId === confirmId) {
          collector.stop();

          try {
            const position = channel.position;

            const newChannel = await channel.clone({
              reason: `${modTag}: channel nuke`,
            });

            await newChannel.setPosition(position).catch(() => {});
            await channel.delete(`${modTag}: channel nuke`);

            await newChannel.send({
              embeds: [new EmbedBuilder().setDescription("Canal nukeado").setColor(RED)],
            });

            const logEmbed = new EmbedBuilder()
              .setTitle("Canal nukeado")
              .setColor(RED)
              .addFields(
                { name: "Canal", value: `\`#${newChannel.name}\``, inline: true },
                { name: "Nuevo ID", value: `\`${newChannel.id}\``, inline: true },
                { name: "Moderador", value: modTag, inline: true }
              )
              .setTimestamp();

            await sendLog(guild, logEmbed);

            await interaction.update({
              embeds: [new EmbedBuilder().setDescription("Canal nukeado correctamente").setColor(RED)],
              components: [],
            });
          } catch (err) {
            log.error("Error en nuke", { err: err?.message ?? String(err) });

            await interaction.update({
              embeds: [new EmbedBuilder().setDescription("No se pudo nukear el canal").setColor(RED).setTimestamp()],
              components: [],
            });
          }
        }
      });

      collector.on("end", async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });
    },
  },
};
