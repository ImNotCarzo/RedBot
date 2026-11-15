const { ChannelType, ComponentType, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ComponentsV2Builder, V2Text } = require("gralonium");
const { RED } = require("../src/config");
const { GuildConfig } = require("../src/database");
const { detectDefaultGuildLang, setLang } = require("../src/guild");
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
        style: active === "es" ? "primary" : "secondary",
        disabled: active === "es",
      },
      {
        customId: "welcome_lang:en",
        label: t(active, "welcome.btn_en"),
        style: active === "en" ? "primary" : "secondary",
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

const event = {
  name: "guildCreate",
  once: false,
  async code(_bot, guild) {
    if (!guild?.id) return;

    let initialLang = detectDefaultGuildLang(guild);
    if (GuildConfig.db?.readyState === 1) {
      try {
        const existing = await GuildConfig.findOne({ guildId: guild.id }).select("lang").lean();
        if (existing?.lang === "es" || existing?.lang === "en") {
          initialLang = existing.lang;
        }
      } catch {}
    }

    await setLang(guild.id, initialLang);
    log.info("Bot añadido a servidor", {
      guildId: guild.id,
      preferredLocale: guild.preferredLocale ?? null,
      lang: initialLang,
    });

    const channel = findWelcomeChannel(guild);
    if (!channel) return;

    let currentLang = initialLang;
    try {
      const sent = await channel.send(buildWelcomeCard(currentLang, guild).toPayload());
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
          currentLang = await setLang(guild.id, nextLang);
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
