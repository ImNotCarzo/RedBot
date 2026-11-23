const { ComponentsV2Builder, InteractionBuilder, Interactions, V2Text } = require("gralonium");
const { GREEN } = require("../../src/config");
const { resolveContextLang } = require("../../src/guild");
const { runWithLang } = require("../../src/i18n");
const { buildSnoozeRow, createReminder } = require("../../src/reminders");
const { replyInteractionEphemeral } = require("../../src/shared/ui");

const PRESET_MS = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

const data = {
  data: new InteractionBuilder({
    name: "reminderSnooze",
    type: Interactions.Button,
    prefix: "rem_snooze:",
    description: "Pospone un recordatorio entregado",
    as_command: false,
  }),
  async code(bot, interaction) {
    const parts = String(interaction.customId ?? "").split(":");
    const ownerId = parts[1] ?? "";
    const preset = parts[2] ?? "";
    const durationMs = PRESET_MS[preset];

    const lang = await resolveContextLang({
      guildId: interaction.guildId ?? null,
      userId: interaction.user?.id ?? null,
      locale: interaction.locale ?? interaction.guildLocale ?? null,
    }).catch(() => "es");

    return runWithLang(lang, async () => {
      if (ownerId && interaction.user?.id !== ownerId) {
        return replyInteractionEphemeral(
          interaction,
          lang === "en" ? "You cannot snooze someone else's reminder." : "No puedes posponer un recordatorio ajeno."
        );
      }

      if (!durationMs) {
        return replyInteractionEphemeral(
          interaction,
          lang === "en" ? "Invalid snooze duration." : "Duración inválida para posponer."
        );
      }

      const rawText = interaction.message?.embeds?.[0]?.description?.trim() ?? "";
      const text = (rawText || (lang === "en" ? "Snoozed reminder" : "Recordatorio pospuesto")).slice(0, 500);
      const remindAt = new Date(Date.now() + durationMs);

      const res = await createReminder(bot, {
        userId: interaction.user.id,
        guildId: interaction.guildId ?? null,
        channelId: interaction.channelId ?? null,
        text,
        remindAt,
      });

      if (res.error === "limit") {
        return replyInteractionEphemeral(
          interaction,
          lang === "en"
            ? `You already have ${res.max} pending reminders; wait until one triggers.`
            : `Ya tienes ${res.max} recordatorios pendientes, espera a que alguno se cumpla.`
        );
      }

      const ts = Math.floor(remindAt.getTime() / 1000);
      const disabledComponents = [buildSnoozeRow(ownerId || interaction.user.id, lang, true)];

      await interaction.update({ components: disabledComponents }).catch(() => {});

      const card = new ComponentsV2Builder({ color: GREEN })
        .addText(
          `${V2Text.heading(lang === "en" ? "Reminder snoozed" : "Recordatorio pospuesto", 3)}\n${V2Text.subtext(`<t:${ts}:f> · <t:${ts}:R>`)}`
        )
        .addSeparator("small")
        .addQuote(text, { maxLength: 1200 });

      const payload = card.toPayload({ ephemeral: true });
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    });
  },
};

module.exports = { data };
