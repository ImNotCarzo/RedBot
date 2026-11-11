const { AutoModerationActionType, EmbedBuilder } = require("discord.js");
const { YELLOW } = require("../src/config");
const { sendLog } = require("../src/guild");

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
    const userLabel = execution.user
      ? `${execution.user.tag} (\`${execution.userId}\`)`
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
  },
};

module.exports = { data };
