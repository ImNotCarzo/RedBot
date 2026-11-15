const { AuditLogEvent, ChannelType, ComponentType, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ComponentsV2Builder, V2Text } = require("gralonium");
const { RED } = require("../src/config");
const {
  detectDefaultGuildLang,
  getOauthGuildLang,
  getUserLang,
  registerWelcomeCard,
  setLang,
} = require("../src/guild");
const { normalizeLang, t } = require("../src/i18n");
const { Logger, sanitizeError } = require("../src/runtime");

const log = new Logger("EVENT_GUILD_CREATE", process.env.LOG_LEVEL);

function buildWelcomeCard(lang, guild) {
  const active = normalizeLang(lang);
  const langLabel = active === "en" ? "English (`en`)" : "Español (`es`)";

  return new ComponentsV2Builder({ color: RED })
    .addSection(
      [
        V2Text.heading(t(active, "welcome.title"), 3, 200),
        V2Text.subtext(guild?.name || "RedBot", 120),
      ],
      { thumbnail: guild?.client?.user?.displayAvatarURL?.({ size: 256 }), fallbackToText: true }
    )
    .addSeparator("small")
    .addText(t(active, "welcome.desc"))
    .addFields([[t(active, "welcome.current"), langLabel]], false)
    .addSpacer("small")
    .addButtonsRow([
      {
        customId: "welcome_lang:es",
        label: t(active, "welcome.btn_es"),
        style: active === "es" ? "danger" : "secondary",
        disabled: active === "es",
      },
      {
        customId: "welcome_lang:en",
        label: t(active, "welcome.btn_en"),
        style: active === "en" ? "danger" : "secondary",
        disabled: active === "en",
      },
    ]);
}

function findWelcomeChannel(guild) {
  const me = guild.members?.me;
  const canSend = (ch) => {
    if (!ch || !ch.isTextBased?.()) return false;
    if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) return false;
    const perms = ch.permissionsFor?.(me || guild.client?.user);
    return Boolean(perms?.has?.(PermissionFlagsBits.ViewChannel) && perms?.has?.(PermissionFlagsBits.SendMessages));
  };

  if (canSend(guild.systemChannel)) return guild.systemChannel;
  return guild.channels?.cache?.find((ch) => canSend(ch)) ?? null;
}

async function resolveInitialGuildLang(guild) {
  const oauthLang = getOauthGuildLang(guild.id);
  if (oauthLang) return { lang: oauthLang, source: "oauth" };

  let inviterId = null;
  try {
    if (guild.members?.me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog) && typeof guild.fetchAuditLogs === "function") {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 3 });
      const botId = guild.client?.user?.id;
      const entry = logs?.entries?.find((e) => !botId || e.target?.id === botId);
      if (entry?.executorId) inviterId = entry.executorId;
    }
  } catch {}

  for (const uid of [inviterId, guild.ownerId]) {
    if (!uid) continue;
    const userLang = await getUserLang(uid);
    if (userLang) return { lang: userLang, source: "oauth" };
  }

  return { lang: detectDefaultGuildLang(guild), source: "auto" };
}

const event = {
  name: "guildCreate",
  once: false,
  async code(_bot, guild) {
    if (!guild?.id) return;

    const { lang: initialLang, source } = await resolveInitialGuildLang(guild);

    await setLang(guild.id, initialLang, { source });
    log.info("Bot añadido a servidor", {
      guildId: guild.id,
      preferredLocale: guild.preferredLocale ?? null,
      lang: initialLang,
      source,
    });

    const channel = findWelcomeChannel(guild);
    if (!channel) return;

    let currentLang = initialLang;
    try {
      const sent = await channel.send(buildWelcomeCard(currentLang, guild).toPayload());
      if (sent?.edit) {
        registerWelcomeCard(guild.id, {
          message: sent,
          guild,
          lang: currentLang,
          source,
          render: (nextLang) => buildWelcomeCard(nextLang, guild).toPayload(),
        });
      }
      if (!sent?.createMessageComponentCollector) return;

      const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 15 * 60_000,
      });

      collector.on("collect", async (interaction) => {
        try {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
              content: t(currentLang, "lang.no_perm"),
              flags: MessageFlags.Ephemeral,
            }).catch(() => {});
            return;
          }

          const nextLang = interaction.customId === "welcome_lang:en" ? "en" : "es";
          currentLang = await setLang(guild.id, nextLang, { source: "manual" });
          await interaction.update(buildWelcomeCard(currentLang, guild).toPayload()).catch(() => {});
        } catch (err) {
          log.warn("Error al cambiar idioma en welcome card", { err: sanitizeError(err) });
        }
      });
    } catch (err) {
      log.warn("No se pudo enviar tarjeta de bienvenida", {
        guildId: guild.id,
        err: sanitizeError(err),
      });
    }
  },
};

module.exports = { data: event, buildWelcomeCard, findWelcomeChannel };
