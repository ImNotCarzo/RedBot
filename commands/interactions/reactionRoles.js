const { MessageFlags } = require("discord.js");
const { InteractionBuilder, Interactions } = require("gralonium");
const { ReactionRolePanel } = require("../../src/database");
const { getLang } = require("../../src/guild");
const { runWithLang } = require("../../src/i18n");
const { applyPanelRoleAction } = require("../../src/reactionRoles");

const data = {
  data: new InteractionBuilder({
    name: "reactionRoles",
    type: Interactions.Button,
    prefix: "rr:",
    description: "Gestiona botones de roles por reacción",
    as_command: false,
  }),
  async code(bot, interaction) {
    if (!interaction?.guildId || !interaction.guild) return;
    const parts = String(interaction.customId ?? "").split(":");
    const panelId = parts[1];
    const entryKey = parts[2];
    if (!panelId || !entryKey) return;

    const lang = await getLang(interaction.guildId).catch(() => "es");
    return runWithLang(lang, async () => {
      const isEn = lang === "en";
      const panel = await ReactionRolePanel.findOne({ guildId: interaction.guildId, panelId }).lean().catch(() => null);
      const entry = panel?.entries?.find((e) => e.key === entryKey);
      if (!panel || !entry) {
        return interaction.reply({
          content: isEn ? "This reaction role panel is no longer active." : "Este panel de roles ya no está activo.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) return;

      const res = await applyPanelRoleAction({
        client: bot?.client ?? interaction.client,
        guild: interaction.guild,
        member,
        panel,
        entry,
      });

      if (res.error === "hierarchy") {
        return interaction.reply({
          content: isEn ? "I don't have permission or hierarchy to manage that role." : "No tengo permisos ni jerarquía suficiente para gestionar ese rol.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      if (res.action === "verify") {
        return interaction.reply({
          content: isEn ? `You already have <@&${entry.roleId}>.` : `Ya tienes <@&${entry.roleId}>.`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      if (res.action === "added_temp") {
        const ts = Math.floor(new Date(res.expiresAt).getTime() / 1000);
        return interaction.reply({
          content: isEn
            ? `Added temporary role <@&${entry.roleId}> (expires <t:${ts}:R>).`
            : `Rol temporal <@&${entry.roleId}> añadido (expira <t:${ts}:R>).`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      const msg = res.action === "added"
        ? (isEn ? `Role <@&${entry.roleId}> added.` : `Rol <@&${entry.roleId}> añadido.`)
        : (isEn ? `Role <@&${entry.roleId}> removed.` : `Rol <@&${entry.roleId}> quitado.`);

      return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    });
  },
};

module.exports = { data };
