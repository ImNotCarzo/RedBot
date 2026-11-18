const { MessageFlags } = require("discord.js");
const { InteractionBuilder, Interactions } = require("gralonium");
const { getLang } = require("../../src/guild");
const { runWithLang } = require("../../src/i18n");
const { executeDramaAction } = require("../../src/moderationExtra");

const data = {
  data: new InteractionBuilder({
    name: "dramaWatcher",
    type: Interactions.Button,
    prefix: "drama:",
    description: "Ejecuta sanciones rápidas desde Drama Watcher",
    as_command: false,
  }),
  async code(_bot, interaction) {
    if (!interaction?.guildId || !interaction.guild) return;
    const [, action, targetId] = String(interaction.customId ?? "").split(":");
    if (!action || !targetId) return;

    const lang = await getLang(interaction.guildId).catch(() => "es");
    return runWithLang(lang, async () => {
      const isEn = lang === "en";
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      const replyErr = (content) =>
        interaction.deferred || interaction.replied
          ? interaction.editReply({ content }).catch(() => {})
          : interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});

      try {
        const modMember =
          (interaction.member?.roles?.highest ? interaction.member : null) ??
          (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
        if (!modMember) {
          return replyErr(isEn ? "Could not verify your server permissions." : "No pude verificar tus permisos en el servidor.");
        }

        const res = await executeDramaAction({
          guild: interaction.guild,
          modMember,
          modUser: interaction.user,
          targetId,
          action,
          message: interaction.message,
        });

        if (res.error === "no_perm") {
          return replyErr(isEn ? "You don't have permission to execute that sanction." : "No tienes permisos para ejecutar esa sanción.");
        }
        if (res.error === "not_found") {
          return replyErr(isEn ? "That user is no longer in the server." : "Ese usuario ya no está en el servidor.");
        }
        if (res.error === "hierarchy" || res.error === "bot_hierarchy") {
          return replyErr(isEn ? "Role hierarchy prevents acting on that member." : "La jerarquía de roles impide actuar sobre ese usuario.");
        }
        if (res.error === "in_progress") {
          return replyErr(isEn ? "An action is already being processed on this alert." : "Ya se está procesando una acción en esta alerta.");
        }
        if (res.error === "invalid_action") {
          return replyErr(isEn ? "Invalid action." : "Acción inválida.");
        }
        if (!res.ok) {
          return replyErr(isEn ? "Could not apply the sanction." : "No se pudo aplicar la sanción.");
        }

        return interaction.deleteReply().catch(() => {});
      } catch {
        return replyErr(isEn ? "An error occurred while applying the sanction." : "Ocurrió un error al aplicar la sanción.");
      }
    });
  },
};

module.exports = { data };
