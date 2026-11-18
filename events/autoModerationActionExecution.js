const { AutoModerationActionType, EmbedBuilder } = require("discord.js");
const { YELLOW } = require("../src/config");
const { sendLog } = require("../src/guild");
const { postToDramaWatcher } = require("../src/moderationExtra");

const ACTION_LABELS = {
  [AutoModerationActionType.BlockMessage]: "Mensaje bloqueado",
  [AutoModerationActionType.SendAlertMessage]: "Alerta enviada",
  [AutoModerationActionType.Timeout]: "Timeout aplicado",
  [AutoModerationActionType.BlockMemberInteraction]: "Interacción bloqueada",
};

const data = {
  name: "autoModerationActionExecution",
  once: false,
  async code(_bot, execution) {
    if (!execution?.guild) return;

    const actionLabel = ACTION_LABELS[execution.action?.type] ?? "Acción de AutoMod";
    const targetUser =
      execution.user ??
      (execution.userId ? await execution.guild.client?.users?.fetch?.(execution.userId).catch(() => null) : null);
    const userLabel = targetUser
      ? `${targetUser.tag} (\`${execution.userId}\`)`
      : `\`${execution.userId}\``;

    const fields = [
      { name: "Usuario", value: userLabel, inline: true },
      { name: "Acción", value: actionLabel, inline: true },
    ];

    if (execution.channelId) {
      fields.push({ name: "Canal", value: `<#${execution.channelId}>`, inline: true });
    }
    if (execution.matchedKeyword) {
      fields.push({ name: "Coincidencia", value: `\`${String(execution.matchedKeyword).slice(0, 100)}\``, inline: true });
    }
    if (execution.content) {
      fields.push({ name: "Contenido", value: String(execution.content).slice(0, 500), inline: false });
    }

    const embed = new EmbedBuilder()
      .setTitle("AutoMod ejecutado")
      .setColor(YELLOW)
      .addFields(fields)
      .setTimestamp();

    await sendLog(execution.guild, embed);
    if (targetUser) {
      await postToDramaWatcher({
        guild: execution.guild,
        targetUser,
        channelId: execution.channelId ?? null,
        reason: execution.matchedKeyword ? `AutoMod Discord: ${execution.matchedKeyword}` : actionLabel,
        ruleName: "Discord AutoMod",
        excerpt: execution.content ? String(execution.content).slice(0, 400) : "",
      }).catch(() => {});
    }
  },
};

module.exports = { data };
