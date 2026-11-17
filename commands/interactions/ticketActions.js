const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ComponentsV2Builder, InteractionBuilder, Interactions } = require("gralonium");
const { RED, GREEN } = require("../../src/config");
const { Ticket } = require("../../src/database");
const { getLang } = require("../../src/guild");
const { runWithLang } = require("../../src/i18n");
const {
  buildTicketControlCard,
  closeTicketChannel,
  generateTicketTranscript,
  getTicketConfig,
  openTicket,
} = require("../../src/tickets");

const data = {
  data: new InteractionBuilder({
    name: "ticketActions",
    type: Interactions.Button,
    prefix: "tkt:",
    description: "Gestiona acciones interactivas de tickets",
    as_command: false,
  }),
  async code(_bot, interaction) {
    if (!interaction?.guildId || !interaction.guild) return;
    const [, action, extra] = String(interaction.customId ?? "").split(":");
    const lang = await getLang(interaction.guildId).catch(() => "es");

    return runWithLang(lang, async () => {
      const isEn = lang === "en";

      if (action === "open") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const res = await openTicket({
          guild: interaction.guild,
          user: interaction.user,
          category: extra || "General",
        }).catch(() => ({ error: "perm" }));

        if (res.error === "already_open") {
          return interaction.editReply({
            content: isEn
              ? `You already have an open ticket in <#${res.channelId}>.`
              : `Ya tienes un ticket abierto en <#${res.channelId}>.`,
          }).catch(() => {});
        }
        if (!res.ok) {
          return interaction.editReply({
            content: isEn
              ? "Could not create the ticket. Check my channel permissions."
              : "No pude crear el ticket. Revisa mis permisos para crear canales.",
          }).catch(() => {});
        }
        return interaction.editReply({
          content: isEn
            ? `Ticket created: <#${res.channel.id}>`
            : `Ticket creado: <#${res.channel.id}>`,
        }).catch(() => {});
      }

      const ticket = await Ticket.findOne({ channelId: interaction.channelId, status: "open" }).lean().catch(() => null);
      if (!ticket) {
        return interaction.reply({
          content: isEn ? "This is not an active ticket channel." : "Este canal no es un ticket activo.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      const cfg = await getTicketConfig(interaction.guildId);
      const isStaff =
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
        (cfg.supportRoleId && interaction.member?.roles?.cache?.has(cfg.supportRoleId));

      if (action === "claim") {
        if (!isStaff) {
          return interaction.reply({
            content: isEn ? "Only support staff can claim tickets." : "Solo el equipo de soporte puede reclamar tickets.",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
        await Ticket.updateOne({ channelId: interaction.channelId }, { $set: { claimedBy: interaction.user.id } }).catch(() => {});
        const updatedCard = buildTicketControlCard({
          ticket,
          openerId: ticket.openerId,
          category: ticket.category,
          welcomeMsg: cfg.welcomeMessage,
          claimedById: interaction.user.id,
          lang,
        });
        let updated = false;
        await interaction.update(updatedCard.toPayload()).then(() => { updated = true; }).catch(() => {});
        if (updated) {
          return interaction.followUp({
            content: isEn ? `Ticket claimed by <@${interaction.user.id}>.` : `Ticket reclamado por <@${interaction.user.id}>.`,
          }).catch(() => {});
        }
        return interaction.reply({
          content: isEn ? `Ticket claimed by <@${interaction.user.id}>.` : `Ticket reclamado por <@${interaction.user.id}>.`,
        }).catch(() => {});
      }

      if (action === "transcript") {
        if (!isStaff && interaction.user.id !== ticket.openerId) {
          return interaction.reply({
            content: isEn ? "You don't have permission to export this transcript." : "No tienes permisos para exportar este historial.",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const t = await generateTicketTranscript(interaction.channel, ticket);
        return interaction.editReply({
          content: isEn ? `Transcript generated (${t.count} messages).` : `Transcripción generada (${t.count} mensajes).`,
          files: [t.htmlAttachment, t.txtAttachment],
        }).catch(() => {});
      }

      if (action === "close") {
        if (!isStaff && interaction.user.id !== ticket.openerId) {
          return interaction.reply({
            content: isEn ? "You don't have permission to close this ticket." : "No tienes permisos para cerrar este ticket.",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
        const confirm = ComponentsV2Builder.confirm({
          title: isEn ? "Close ticket?" : "¿Cerrar ticket?",
          message: isEn
            ? "A full transcript (.html y .txt) will be exported before deleting this channel."
            : "Se guardará la transcripción completa (.html y .txt) antes de eliminar este canal.",
          confirmId: "tkt:close_confirm",
          cancelId: "tkt:close_cancel",
          confirmLabel: isEn ? "Confirm" : "Confirmar",
          cancelLabel: isEn ? "Cancel" : "Cancelar",
          cancelStyle: "secondary",
          color: RED,
        });
        return interaction.reply(confirm.toPayload({ ephemeral: true })).catch(() => {});
      }

      if (action === "close_cancel") {
        return interaction.update(
          ComponentsV2Builder.card({ description: isEn ? "Ticket closure cancelled." : "Cierre de ticket cancelado.", color: GREEN }).toPayload()
        ).catch(() => {});
      }

      if (action === "close_confirm") {
        await interaction.update(
          ComponentsV2Builder.card({ description: isEn ? "Saving transcript & closing ticket..." : "Guardando transcripción y cerrando ticket...", color: RED }).toPayload()
        ).catch(() => {});
        await closeTicketChannel({ channel: interaction.channel, closedByUser: interaction.user });
      }
    });
  },
};

module.exports = { data };
