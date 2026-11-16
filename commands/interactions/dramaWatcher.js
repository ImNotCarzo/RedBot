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
      const modMember = interaction.member ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!modMember) return;

      const res = await executeDramaAction({
        guild: interaction.guild,
        modMember,
        modUser: interaction.user,
        targetId,
        action,
        message: interaction.message,
      });

      if (res.error === "no_perm") {
        return interaction.reply({
          content: isEn ? "You don't have permission to execute that sanction." : "No tienes permisos para ejecutar esa sanción.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
      if (res.error === "not_found") {
        return interaction.reply({
          content: isEn ? "That user is no longer in the server." : "Ese usuario ya no está en el servidor.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
      if (res.error === "hierarchy" || res.error === "bot_hierarchy") {
        return interaction.reply({
          content: isEn ? "Role hierarchy prevents acting on that member." : "La jerarquía de roles impide actuar sobre ese usuario.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate().catch(() => {});
      }
    });
  },
};

module.exports = { data };
