const {
  AttachmentBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const mongoose = require("mongoose");
const { ComponentsV2Builder, V2Text, V2View } = require("gralonium");
const { RED, GREEN } = require("./config");
const { GuildConfig, Ticket } = require("./database");
const { getCurrentLang } = require("./i18n");
const { Logger } = require("./runtime");
const { escapeHtml } = require("./security");

const log = new Logger("TICKETS");
const openingTickets = new Set();
const closingTickets = new Set();

async function getTicketConfig(guildId) {
  const defaults = {
    enabled: false,
    categoryId: null,
    logChannelId: null,
    supportRoleId: null,
    welcomeMessage: "Describe tu consulta y un miembro del equipo te atenderá pronto.",
    panelPlaceholder: "Abrir Tickets",
    categories: [],
    counter: 0,
  };
  if (!guildId || mongoose.connection.readyState !== 1) return defaults;
  try {
    const doc = await GuildConfig.findOne({ guildId }).select("ticketConfig").lean();
    return { ...defaults, ...(doc?.ticketConfig || {}) };
  } catch {
    return defaults;
  }
}

async function updateTicketConfig(guildId, patch) {
  if (!guildId || mongoose.connection.readyState !== 1) return null;
  const setObj = {};
  for (const [k, v] of Object.entries(patch)) setObj[`ticketConfig.${k}`] = v;
  const doc = await GuildConfig.findOneAndUpdate(
    { guildId },
    { $set: setObj },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return doc?.ticketConfig ?? null;
}

function isTicketConfigTouched(tc) {
  if (!tc) return false;
  return Boolean(
    tc.enabled ||
    (tc.counter && tc.counter > 0) ||
    tc.categoryId ||
    tc.logChannelId ||
    tc.supportRoleId ||
    (Array.isArray(tc.categories) && tc.categories.length > 0)
  );
}

function isValidMenuEmoji(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (/^<(a)?:[a-zA-Z0-9_~]+:\d{15,22}>$/.test(s)) return true;
  if (/^(?:a:)?[a-zA-Z0-9_~]+:\d{15,22}$/.test(s)) return true;
  if (s.length <= 16 && /\p{Extended_Pictographic}/u.test(s) && !/[a-zA-Z0-9]/.test(s)) return true;
  return false;
}

function makeUniqueCategoryId(label, idx, usedIds) {
  const base = String(label || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || `opt-${idx + 1}`;
  let candidate = base;
  let n = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base.slice(0, 28)}-${n++}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function parseTicketMenuOptions(rawInput, guild = null) {
  if (!rawInput) return [];
  const entries = Array.isArray(rawInput)
    ? rawInput
    : String(rawInput)
        .split(/\r?\n|;/)
        .map((s) => s.trim())
        .filter(Boolean);

  const parsed = [];
  const usedIds = new Set();

  for (let i = 0; i < entries.length && parsed.length < 25; i++) {
    const item = entries[i];
    let emoji = null;
    let label = "";
    let description = "";
    let bodyText = "";
    let categoryId = null;
    let supportRoleId = null;
    let customId = null;

    if (item && typeof item === "object") {
      emoji = isValidMenuEmoji(item.emoji) ? String(item.emoji).trim() : null;
      label = String(item.label ?? "").trim().slice(0, 80);
      description = String(item.description ?? "").trim().slice(0, 100);
      bodyText = String(item.bodyText ?? "").trim().slice(0, 300);
      categoryId = item.categoryId ? String(item.categoryId).trim() : null;
      supportRoleId = item.supportRoleId ? String(item.supportRoleId).trim() : null;
      customId = item.id ? String(item.id).trim().slice(0, 64) : null;
    } else {
      const line = String(item ?? "").trim();
      if (!line) continue;
      if (line.includes("|")) {
        const parts = line.split("|").map((p) => p.trim());
        let cursor = 0;
        if (parts.length >= 2 && isValidMenuEmoji(parts[0])) {
          emoji = parts[0];
          cursor = 1;
        }
        label = (parts[cursor] || "").slice(0, 80);
        const seg1 = (parts[cursor + 1] || "").trim();
        const seg2 = (parts[cursor + 2] || "").trim();
        if (seg2) {
          description = seg1.slice(0, 100);
          bodyText = seg2.slice(0, 300);
        } else if (seg1) {
          description = seg1.slice(0, 100);
          bodyText = seg1.slice(0, 300);
        }
      } else {
        // Evitar partir por los ':' internos de un emoji personalizado <a?:nombre:id>
        let working = line;
        const customEmojiLead = working.match(/^(<a?:[a-zA-Z0-9_~]+:\d{15,22}>)\s+(.+)$/);
        if (customEmojiLead) {
          emoji = customEmojiLead[1];
          working = customEmojiLead[2].trim();
        }
        const strippedForColon = working.replace(/<a?:[a-zA-Z0-9_~]+:\d{15,22}>/g, (m) => " ".repeat(m.length));
        const idx = strippedForColon.indexOf(":");
        if (idx > 0) {
          label = working.slice(0, idx).trim().slice(0, 80);
          const detail = working.slice(idx + 1).trim();
          description = detail.slice(0, 100);
          bodyText = detail.slice(0, 300);
        } else {
          label = working.slice(0, 80);
        }
      }
    }

    if (!label) continue;
    if (supportRoleId && guild) {
      const validRole = supportRoleId !== guild.id && guild.roles?.cache?.has(supportRoleId);
      if (!validRole) supportRoleId = null;
    }
    if (categoryId && guild) {
      const ch = guild.channels?.cache?.get(categoryId);
      if (!ch || ch.type !== ChannelType.GuildCategory) categoryId = null;
    }

    const id = customId && !usedIds.has(customId)
      ? (usedIds.add(customId), customId)
      : makeUniqueCategoryId(label, parsed.length, usedIds);

    parsed.push({
      id,
      label,
      description,
      bodyText,
      emoji,
      categoryId: categoryId || null,
      supportRoleId: supportRoleId || null,
    });
  }

  return parsed;
}

function formatTicketMenuOptionsText(categories) {
  if (!Array.isArray(categories) || !categories.length) return "";
  return categories
    .map((c) => {
      const cols = [];
      if (c.emoji) cols.push(c.emoji);
      cols.push(c.label);
      if (c.description && c.bodyText && c.description !== c.bodyText) {
        cols.push(c.description, c.bodyText);
      } else if (c.bodyText || c.description) {
        cols.push(c.bodyText || c.description);
      }
      return cols.join(" | ");
    })
    .join("\n")
    .slice(0, 4000);
}

function buildTicketPanelPayload({
  title = null,
  description = null,
  category = "General",
  buttonLabel = null,
  placeholder = null,
  options = null,
  lang = "es",
} = {}) {
  const isEn = lang === "en";
  const resolvedTitle = title || (isEn ? "Support" : "Soporte");
  const parsedOptions = parseTicketMenuOptions(options);

  if (parsedOptions.length > 0) {
    const optionLines = parsedOptions
      .filter((opt) => opt.bodyText || opt.description)
      .map((opt) => `» ${opt.emoji ? `${opt.emoji} ` : ""}**${opt.label}:** *${opt.bodyText || opt.description}*`);

    const intro = description ? String(description).trim() : "";
    const defaultIntro = isEn
      ? "Select a category below to open a private ticket with our team."
      : "Selecciona una categoría abajo para abrir un ticket privado con el equipo.";
    const bodyParts = [];
    if (intro) bodyParts.push(intro);
    if (optionLines.length) bodyParts.push(optionLines.join("\n\n"));
    const bodyText = bodyParts.length ? bodyParts.join("\n\n") : defaultIntro;

    const menuPlaceholder = String(
      placeholder || buttonLabel || (isEn ? "Open Tickets" : "Abrir Tickets")
    ).trim().slice(0, 100) || (isEn ? "Open Tickets" : "Abrir Tickets");

    const builder = new ComponentsV2Builder({ color: RED })
      .addText(V2Text.heading(resolvedTitle, 3, 200))
      .addSeparator("small")
      .addText(V2Text.clip(bodyText, 3800))
      .addSpacer("small")
      .addSelectMenu({
        customId: "tkt:select",
        placeholder: menuPlaceholder,
        options: parsedOptions.map((opt, idx) => ({
          label: opt.label.slice(0, 80),
          value: (opt.id || opt.label || `opt_${idx}`).slice(0, 80),
          ...(opt.description ? { description: opt.description.slice(0, 100) } : {}),
          ...(opt.emoji ? { emoji: opt.emoji } : {}),
        })),
      });
    builder._i18nLang = lang;
    return builder.toPayload();
  }

  const resolvedDesc = description || (isEn
    ? "Press the button below to open a private ticket with our team."
    : "Pulsa el botón para abrir un ticket privado con el equipo.");
  const resolvedCategory = String(category || "General").trim().slice(0, 40) || "General";
  const resolvedButton = String(buttonLabel || (isEn ? "Open ticket" : "Abrir ticket")).trim().slice(0, 80);

  const builder = new ComponentsV2Builder({ color: RED })
    .addText(V2Text.heading(resolvedTitle, 3, 200))
    .addSeparator("small")
    .addText(resolvedDesc);

  if (resolvedCategory.toLowerCase() !== "general") {
    builder.addText(V2Text.subtext(isEn ? `Category: ${resolvedCategory}` : `Categoría: ${resolvedCategory}`, 120));
  }

  builder
    .addSpacer("small")
    .addButtonsRow([
      {
        customId: `tkt:open:${resolvedCategory}`,
        label: resolvedButton,
        style: "danger",
      },
    ]);
  builder._i18nLang = lang;
  return builder.toPayload();
}

function buildTicketControlCard({
  ticket,
  openerUser = null,
  openerId = null,
  category = "General",
  welcomeMsg,
  claimedById = null,
  lang = "es",
}) {
  const isEn = lang === "en";
  const resolvedOpenerId = openerUser?.id ?? openerId ?? ticket?.openerId;
  const resolvedClaimedId = claimedById ?? ticket?.claimedBy ?? null;
  const resolvedCategory = category || ticket?.category || "General";
  const DEFAULT_ES_WELCOME = "Describe tu consulta y un miembro del equipo te atenderá pronto.";
  const resolvedWelcome = (!welcomeMsg || (isEn && welcomeMsg === DEFAULT_ES_WELCOME))
    ? (isEn ? "Describe your question and a staff member will assist you shortly." : DEFAULT_ES_WELCOME)
    : welcomeMsg;

  const builder = new ComponentsV2Builder({ color: RED })
    .addText(
      `${V2Text.heading(`Ticket #${String(ticket?.number ?? 1).padStart(4, "0")}`, 3)}\n` +
      V2Text.subtext(resolvedCategory, 120)
    )
    .addSeparator("small")
    .addText(resolvedWelcome)
    .addSeparator("small")
    .addFields([
      [isEn ? "User" : "Usuario", `<@${resolvedOpenerId}>`],
      [isEn ? "Status" : "Estado", V2Text.code(resolvedClaimedId ? (isEn ? "Claimed" : "Reclamado") : (isEn ? "Open" : "Abierto"))],
      resolvedClaimedId ? [isEn ? "Claimed by" : "Atendido por", `<@${resolvedClaimedId}>`] : null,
    ].filter(Boolean))
    .addSpacer("small")
    .addButtonsRow([
      {
        customId: "tkt:claim",
        label: resolvedClaimedId ? (isEn ? "Claimed" : "Reclamado") : (isEn ? "Claim" : "Reclamar"),
        style: "secondary",
        disabled: Boolean(resolvedClaimedId),
      },
      {
        customId: "tkt:transcript",
        label: isEn ? "Transcript" : "Transcripción",
        style: "secondary",
      },
      {
        customId: "tkt:close",
        label: isEn ? "Close" : "Cerrar",
        style: "danger",
      },
    ]);
  builder._i18nLang = lang;
  return builder;
}

function buildTicketSetupCard({ guild, cfg, lang = "es", view = null, isEnded = false }) {
  const isEn = lang === "en";
  const builder = new ComponentsV2Builder({ color: RED })
    .addSection(
      [
        V2Text.heading(isEn ? "Ticket configuration" : "Configuración de tickets", 3, 200),
        V2Text.subtext(guild.name, 120),
      ],
      { thumbnail: guild.iconURL({ size: 256 }), fallbackToText: true }
    )
    .addSeparator("small")
    .addFields([
      [isEn ? "Status" : "Estado", V2Text.code(cfg.enabled ? (isEn ? "Enabled" : "Activado") : (isEn ? "Disabled" : "Desactivado"))],
      [isEn ? "Category" : "Categoría", cfg.categoryId ? `<#${cfg.categoryId}>` : (isEn ? "No category" : "Sin categoría")],
      [isEn ? "Logs / Transcripts" : "Logs / Transcripciones", cfg.logChannelId ? `<#${cfg.logChannelId}>` : (isEn ? "Disabled" : "Desactivado")],
      [isEn ? "Support role" : "Rol soporte", cfg.supportRoleId ? `<@&${cfg.supportRoleId}>` : (isEn ? "Admins only" : "Solo administradores")],
      cfg.categories?.length
        ? [isEn ? "Menu options" : "Opciones del menú", V2Text.code(`${cfg.categories.length}`)]
        : null,
      [isEn ? "Welcome message" : "Mensaje inicial", V2Text.clip(cfg.welcomeMessage, 140)],
    ].filter(Boolean));

  if (!isEnded && view) {
    const hasSelection = Boolean(cfg.categoryId || cfg.logChannelId || cfg.supportRoleId);
    builder
      .addSpacer("small")
      .addChannelSelectMenu({
        customId: view.id("category"),
        placeholder: isEn ? "Select category for new tickets..." : "Seleccionar categoría para tickets...",
        channelTypes: [ChannelType.GuildCategory],
        ...(cfg.categoryId ? { defaultChannels: [cfg.categoryId] } : {}),
      })
      .addSpacer("small")
      .addChannelSelectMenu({
        customId: view.id("logs"),
        placeholder: isEn ? "Select logs & transcripts channel..." : "Seleccionar canal de logs y transcripciones...",
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        ...(cfg.logChannelId ? { defaultChannels: [cfg.logChannelId] } : {}),
      })
      .addSpacer("small")
      .addRoleSelectMenu({
        customId: view.id("role"),
        placeholder: isEn ? "Select support team role..." : "Seleccionar rol del equipo de soporte...",
        ...(cfg.supportRoleId ? { defaultRoles: [cfg.supportRoleId] } : {}),
      })
      .addSpacer("small")
      .addButtonsRow([
        {
          customId: view.id("welcome"),
          label: isEn ? "Welcome message" : "Mensaje inicial",
          style: "danger",
        },
        {
          customId: view.id("panel"),
          label: isEn ? "Publish panel" : "Publicar panel",
          style: "secondary",
        },
        {
          customId: view.id("toggle"),
          label: cfg.enabled ? (isEn ? "Disable" : "Desactivar") : (isEn ? "Enable" : "Activar"),
          style: cfg.enabled ? "secondary" : "danger",
        },
        {
          customId: view.id("clear"),
          label: isEn ? "Clear selection" : "Limpiar selección",
          style: "secondary",
          disabled: !hasSelection,
        },
      ]);
  }

  builder._i18nLang = lang;
  return builder;
}

function buildTicketWelcomeModal(customId, currentMessage, lang = "es") {
  const isEn = lang === "en";
  const input = new TextInputBuilder()
    .setCustomId("welcome")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(1500)
    .setRequired(true)
    .setPlaceholder(
      isEn
        ? "Message shown inside newly opened tickets..."
        : "Mensaje que se enviará al abrir un nuevo ticket..."
    );
  if (currentMessage) input.setValue(String(currentMessage).slice(0, 1500));

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(isEn ? "Ticket welcome message" : "Mensaje inicial del ticket")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(isEn ? "Message inside the ticket" : "Mensaje dentro del ticket")
        .setTextInputComponent(input)
    );
}

function buildTicketPanelModal(customId, cfg = null, lang = "es") {
  const isEn = lang === "en";
  const optionsText = formatTicketMenuOptionsText(cfg?.categories);
  const optionsInput = new TextInputBuilder()
    .setCustomId("options")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(0)
    .setMaxLength(4000)
    .setRequired(false)
    .setPlaceholder(
      isEn
        ? "One per line: ⛔ | Reports | Subtext | Panel description\nLeave empty for single button"
        : "Una por línea: ⛔ | Reportes | Subtexto | Descripción\nVacío = botón simple"
    );
  if (optionsText) optionsInput.setValue(optionsText);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(isEn ? "Publish ticket panel" : "Publicar panel de tickets")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(isEn ? "Panel title" : "Título del panel")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("title")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(100)
            .setRequired(true)
            .setValue(isEn ? "Support" : "Soporte")
        ),
      new LabelBuilder()
        .setLabel(isEn ? "Intro description (optional)" : "Descripción inicial (opcional)")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("description")
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(0)
            .setMaxLength(1000)
            .setRequired(false)
            .setPlaceholder(
              isEn
                ? "Optional header text above the categories list..."
                : "Texto opcional arriba de las categorías..."
            )
        ),
      new LabelBuilder()
        .setLabel(isEn ? "Dropdown options (optional)" : "Opciones de menú (opcional)")
        .setDescription(isEn ? "Format: emoji | Name | Subtext | Detail" : "Formato: emoji | Nombre | Subtexto | Detalle")
        .setTextInputComponent(optionsInput),
      new LabelBuilder()
        .setLabel(isEn ? "Menu placeholder / button text" : "Placeholder del menú o texto del botón")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("button")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(80)
            .setRequired(false)
            .setValue(String(cfg?.panelPlaceholder || (isEn ? "Open Tickets" : "Abrir Tickets")).slice(0, 80))
        ),
      new LabelBuilder()
        .setLabel(isEn ? "Target channel (optional)" : "Canal destino (opcional)")
        .setDescription(isEn ? "Defaults to the current channel" : "Por defecto se envía en el canal actual")
        .setChannelSelectMenuComponent(
          new ChannelSelectMenuBuilder()
            .setCustomId("target_channel")
            .setPlaceholder(isEn ? "Select a text channel..." : "Selecciona un canal de texto...")
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(0)
            .setMaxValues(1)
            .setRequired(false)
        )
    );
}

async function sendTicketSetupPanel(ctx, { initialCfg = null } = {}) {
  const guild = ctx.guild;
  const author = ctx.user;
  const lang = await require("./guild").getLang(guild.id).catch(() => getCurrentLang());
  const isEn = lang === "en";
  const cfg = initialCfg ?? await getTicketConfig(guild.id);

  const view = new V2View({
    authorId: author.id,
    timeout: 3 * 60_000,
    thirdPartyMode: "reject",
    thirdPartyMessage: isEn ? "You cannot use this menu" : "No puedes usar este menú",
    onEnd: "static",
    state: { cfg, lang },
    render: ({ state, view: activeView, isEnded }) =>
      buildTicketSetupCard({ guild, cfg: state.cfg, lang: state.lang, view: activeView, isEnded }),
    renderStatic: ({ state }) =>
      buildTicketSetupCard({ guild, cfg: state.cfg, lang: state.lang, isEnded: true }),
    actions: {
      category: async ({ values, interaction, setState }) => {
        const categoryId = values[0];
        if (!categoryId) return false;
        const ch = guild.channels.cache.get(categoryId) ?? await guild.channels.fetch(categoryId).catch(() => null);
        if (!ch || ch.type !== ChannelType.GuildCategory) {
          await interaction.reply({
            content: isEn ? "Please select a valid category channel." : "Debes seleccionar una categoría válida.",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
          return false;
        }
        const nextCfg = await updateTicketConfig(guild.id, { enabled: true, categoryId });
        if (nextCfg) setState({ cfg: nextCfg });
      },
      logs: async ({ values, interaction, setState }) => {
        const logChannelId = values[0];
        if (!logChannelId) return false;
        const ch = guild.channels.cache.get(logChannelId) ?? await guild.channels.fetch(logChannelId).catch(() => null);
        if (!ch?.isTextBased?.()) {
          await interaction.reply({
            content: isEn ? "The logs channel must be a text channel." : "El canal de logs debe ser de texto.",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
          return false;
        }
        const nextCfg = await updateTicketConfig(guild.id, { enabled: true, logChannelId });
        if (nextCfg) setState({ cfg: nextCfg });
      },
      role: async ({ values, interaction, setState }) => {
        const supportRoleId = values[0];
        if (!supportRoleId) return false;
        if (supportRoleId === guild.id) {
          await interaction.reply({
            content: isEn ? "You cannot select `@everyone` as support role." : "No puedes seleccionar `@everyone` como rol de soporte.",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
          return false;
        }
        const nextCfg = await updateTicketConfig(guild.id, { enabled: true, supportRoleId });
        if (nextCfg) setState({ cfg: nextCfg });
      },
      toggle: async ({ state, setState }) => {
        const nextCfg = await updateTicketConfig(guild.id, { enabled: !state.cfg.enabled });
        if (nextCfg) setState({ cfg: nextCfg });
      },
      clear: async ({ setState }) => {
        const nextCfg = await updateTicketConfig(guild.id, {
          categoryId: null,
          logChannelId: null,
          supportRoleId: null,
        });
        if (nextCfg) setState({ cfg: nextCfg });
      },
      welcome: async ({ interaction, state, view: activeView }) => {
        const modalId = activeView.id("tkt_welcome", Date.now().toString(36));
        await interaction.showModal(buildTicketWelcomeModal(modalId, state.cfg.welcomeMessage, state.lang));

        const submitted = await interaction.awaitModalSubmit({
          time: 3 * 60_000,
          filter: (i) => i.customId === modalId && i.user.id === author.id,
        }).catch(() => null);
        if (!submitted) return false;

        const msg = submitted.fields.getTextInputValue("welcome")?.trim().slice(0, 1500);
        await submitted.deferUpdate().catch(() => {});
        if (!msg) return false;

        const nextCfg = await updateTicketConfig(guild.id, { enabled: true, welcomeMessage: msg });
        if (nextCfg) activeView.setState({ cfg: nextCfg });
        if (activeView.message?.editable) {
          await activeView.message.edit(activeView.toPayload()).catch(() => {});
        }
        return false;
      },
      panel: async ({ interaction, state, view: activeView }) => {
        const modalId = activeView.id("tkt_panel", Date.now().toString(36));
        await interaction.showModal(buildTicketPanelModal(modalId, state.cfg, state.lang));

        const submitted = await interaction.awaitModalSubmit({
          time: 3 * 60_000,
          filter: (i) => i.customId === modalId && i.user.id === author.id,
        }).catch(() => null);
        if (!submitted) return false;

        await submitted.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        const title = submitted.fields.getTextInputValue("title")?.trim();
        const description = submitted.fields.getTextInputValue("description")?.trim() || null;
        const optionsRaw = submitted.fields.getTextInputValue("options")?.trim() || "";
        const buttonOrPlaceholder = submitted.fields.getTextInputValue("button")?.trim() || null;

        const parsedOptions = parseTicketMenuOptions(optionsRaw);
        const selectedCh = submitted.fields.getSelectedChannels("target_channel", false)?.first?.() ?? null;
        const targetChannel = selectedCh
          ? (guild.channels.cache.get(selectedCh.id) ?? await guild.channels.fetch(selectedCh.id).catch(() => null))
          : ctx.channel;
        if (!targetChannel?.isTextBased?.()) {
          await submitted.editReply({
            content: isEn ? "Could not send the panel to that channel." : "No pude enviar el panel en ese canal.",
          }).catch(() => {});
          return false;
        }

        const payload = buildTicketPanelPayload({
          title,
          description,
          category: "General",
          buttonLabel: parsedOptions.length ? null : buttonOrPlaceholder,
          placeholder: parsedOptions.length ? buttonOrPlaceholder : null,
          options: parsedOptions.length ? parsedOptions : null,
          lang: state.lang,
        });
        try {
          await targetChannel.send(payload);
        } catch {
          await submitted.editReply({
            content: isEn ? "Could not send the panel to this channel (check permissions)." : "No pude enviar el panel en este canal (verifica los permisos).",
          }).catch(() => {});
          return false;
        }

        const cfgPatch = { enabled: true };
        if (parsedOptions.length) {
          cfgPatch.categories = parsedOptions;
          if (buttonOrPlaceholder) cfgPatch.panelPlaceholder = buttonOrPlaceholder.slice(0, 100);
        } else if (optionsRaw === "" && state.cfg.categories?.length) {
          cfgPatch.categories = [];
        }

        const nextCfg = await updateTicketConfig(guild.id, cfgPatch);
        if (nextCfg) {
          activeView.setState({ cfg: nextCfg });
          if (activeView.message?.editable) {
            await activeView.message.edit(activeView.toPayload()).catch(() => {});
          }
        }

        await submitted.editReply({
          content: isEn ? `Ticket panel published in ${targetChannel}.` : `Panel de tickets publicado en ${targetChannel}.`,
        }).catch(() => {});
        return false;
      },
    },
  });

  await view.send(ctx);
}

async function openTicket({ guild, user, category = "General", categoryChannelId = null, supportRoleId = null }) {
  if (!guild?.id || !user?.id || mongoose.connection.readyState !== 1) return { error: "unavailable" };

  const lockKey = `${guild.id}:${user.id}`;
  if (openingTickets.has(lockKey)) return { error: "already_open", channelId: null };
  openingTickets.add(lockKey);

  try {
    const existing = await Ticket.findOne({ guildId: guild.id, openerId: user.id, status: "open" }).lean().catch(() => null);
    if (existing) {
      const ch = guild.channels.cache.get(existing.channelId) ?? await guild.channels.fetch(existing.channelId).catch(() => null);
      if (ch) return { error: "already_open", channelId: ch.id };
      await Ticket.updateOne({ channelId: existing.channelId }, { $set: { status: "closed" } }).catch(() => {});
    }

    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    if (!me?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
      throw new Error("Missing ManageChannels permission");
    }

    const currentCfg = await getTicketConfig(guild.id);
    const isTouched = isTicketConfigTouched(currentCfg);
    if (isTouched && !currentCfg.enabled) return { error: "disabled" };

    const updatedGuild = await GuildConfig.findOneAndUpdate(
      { guildId: guild.id },
      {
        $inc: { "ticketConfig.counter": 1 },
        ...(!isTouched ? { $set: { "ticketConfig.enabled": true } } : {}),
      },
      { upsert: true, returnDocument: "after" }
    ).lean();

    const cfg = updatedGuild?.ticketConfig ?? {};
    const catList = Array.isArray(cfg.categories) ? cfg.categories : [];
    const rawCat = String(category || "General").trim();
    const matchedCat = catList.find(
      (c) => c.id === rawCat || String(c.label || "").toLowerCase() === rawCat.toLowerCase()
    ) ?? null;

    const resolvedCategoryLabel = String(matchedCat?.label || rawCat || "General").slice(0, 80);
    const resolvedParentId = categoryChannelId || matchedCat?.categoryId || cfg.categoryId || null;
    const resolvedSupportRoleId = supportRoleId || matchedCat?.supportRoleId || cfg.supportRoleId || null;

    const ticketNum = cfg.counter || 1;
    const safeUser = String(user.username || "user").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 14) || "user";
    const channelName = `ticket-${String(ticketNum).padStart(4, "0")}-${safeUser}`;

    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ];
    const meId = me?.id ?? guild.client?.user?.id;
    if (meId) {
      overwrites.push({
        id: meId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }
    const supportRole = resolvedSupportRoleId && resolvedSupportRoleId !== guild.id
      ? guild.roles.cache.get(resolvedSupportRoleId)
      : null;
    if (supportRole) {
      overwrites.push({
        id: supportRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }

    const parentCh = resolvedParentId ? guild.channels.cache.get(resolvedParentId) : null;
    const parent = parentCh?.type === ChannelType.GuildCategory ? parentCh.id : undefined;
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent,
      permissionOverwrites: overwrites,
      reason: `Ticket #${ticketNum} abierto por ${user.tag || user.username}`,
    });

    let ticket;
    try {
      ticket = await Ticket.create({
        guildId: guild.id,
        channelId: channel.id,
        openerId: user.id,
        number: ticketNum,
        category: resolvedCategoryLabel,
        status: "open",
      });
    } catch (err) {
      await channel.delete("Rollback por fallo en base de datos").catch(() => {});
      throw err;
    }

    const lang = getCurrentLang();
    const controlCard = buildTicketControlCard({
      ticket,
      openerUser: user,
      category: ticket.category,
      welcomeMsg: cfg.welcomeMessage || "Describe tu consulta y un miembro del equipo te atenderá pronto.",
      lang,
    });

    const mentionPing = supportRole ? `<@${user.id}> <@&${supportRole.id}>` : `<@${user.id}>`;
    await channel.send(controlCard.toPayload()).catch(() => {});
    await channel.send({ content: mentionPing, allowedMentions: { users: [user.id], roles: supportRole ? [supportRole.id] : [] } }).catch(() => {});

    return { ok: true, channel, ticket };
  } finally {
    openingTickets.delete(lockKey);
  }
}

async function generateTicketTranscript(channel, ticket) {
  const collected = [];
  let before;
  for (let page = 0; page < 5; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    collected.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  const ordered = collected.reverse();
  const txtLines = [
    `RedBot Ticket Transcript — #${channel.name} (${channel.id})`,
    `Server: ${channel.guild?.name ?? "?"} (${channel.guildId})`,
    `Ticket #${ticket?.number ?? "?"} · Opener: ${ticket?.openerId ?? "?"} · Claimed by: ${ticket?.claimedBy ?? "Nobody"}`,
    `Generated: ${new Date().toISOString()} · Messages: ${ordered.length}`,
    "=".repeat(72),
    "",
  ];

  const htmlRows = [];
  for (const m of ordered) {
    const iso = m.createdAt?.toISOString?.() ?? "";
    const author = m.author?.tag ?? m.author?.username ?? "Unknown";
    const text = m.content || (m.embeds?.length ? `[Embed: ${m.embeds[0]?.title || m.embeds[0]?.description || "..."}]` : "");
    const attLinks = [...(m.attachments?.values?.() ?? [])].map((a) => a.url);
    txtLines.push(`[${iso}] ${author} (${m.author?.id ?? "?"}): ${text}`);
    for (const u of attLinks) txtLines.push(`  [Attachment]: ${u}`);

    htmlRows.push(
      `<div class="msg"><div class="meta"><span class="author">${escapeHtml(author)}</span>` +
      `<span class="time">${escapeHtml(iso)}</span></div>` +
      (text ? `<div class="body">${escapeHtml(text)}</div>` : "") +
      attLinks.map((u) => `<div class="att"><a href="${escapeHtml(u)}" target="_blank">${escapeHtml(u)}</a></div>`).join("") +
      `</div>`
    );
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Transcript #${escapeHtml(channel.name)}</title>
<style>body{background:#141518;color:#f2f3f5;font-family:system-ui,sans-serif;margin:0;padding:24px}
.wrap{max-width:860px;margin:auto;background:#1e1f24;border:1px solid #ff383d55;border-radius:12px;padding:20px}
h1{margin:0 0 6px;font-size:20px;color:#ff5a5e}.sub{color:#b5bac1;font-size:13px;margin-bottom:16px}
.msg{padding:10px 12px;border-top:1px solid #2b2d31}.meta{font-size:12px;margin-bottom:4px}
.author{font-weight:700;color:#fff;margin-right:8px}.time{color:#949ba4}
.body{white-space:pre-wrap;line-height:1.45;font-size:14px}.att a{color:#ff5a5e;font-size:13px}</style></head>
<body><div class="wrap"><h1>Transcript #${escapeHtml(channel.name)}</h1>
<div class="sub">Server: ${escapeHtml(channel.guild?.name || "")} · Messages: ${ordered.length}</div>
${htmlRows.join("\n")}</div></body></html>`;

  const baseName = `transcript-${channel.name}`;
  return {
    count: ordered.length,
    txtAttachment: new AttachmentBuilder(Buffer.from(txtLines.join("\n"), "utf8"), { name: `${baseName}.txt` }),
    htmlAttachment: new AttachmentBuilder(Buffer.from(html, "utf8"), { name: `${baseName}.html` }),
  };
}

async function closeTicketChannel({ channel, closedByUser, reason = null }) {
  const guild = channel?.guild;
  if (!guild || mongoose.connection.readyState !== 1) return { error: "unavailable" };

  if (closingTickets.has(channel.id)) return { error: "not_ticket" };
  closingTickets.add(channel.id);

  try {
    const ticket = await Ticket.findOne({ channelId: channel.id, status: "open" }).lean().catch(() => null);
    if (!ticket) return { error: "not_ticket" };

    const cfg = await getTicketConfig(guild.id);
    const transcript = await generateTicketTranscript(channel, ticket);

    await Ticket.updateOne({ channelId: channel.id }, { $set: { status: "closed" } }).catch(() => {});

    const lang = getCurrentLang();
    const summaryCard = new ComponentsV2Builder({ color: GREEN })
      .addText(
        `${V2Text.heading(lang === "en" ? `Ticket #${ticket.number} closed` : `Ticket #${ticket.number} cerrado`, 3)}\n` +
        V2Text.fields([
          [lang === "en" ? "Opened by" : "Abierto por", `<@${ticket.openerId}>`],
          [lang === "en" ? "Closed by" : "Cerrado por", `<@${closedByUser.id}>`],
          [lang === "en" ? "Messages" : "Mensajes", V2Text.code(transcript.count)],
          reason ? [lang === "en" ? "Reason" : "Motivo", V2Text.clip(reason, 300)] : null,
        ])
      )
      .toPayload();

    if (cfg.logChannelId) {
      const logCh = guild.channels.cache.get(cfg.logChannelId) ?? await guild.channels.fetch(cfg.logChannelId).catch(() => null);
      if (logCh?.isTextBased?.()) {
        await logCh.send({ ...summaryCard, files: [transcript.htmlAttachment, transcript.txtAttachment] }).catch(() => {});
      }
    }

    const opener = await guild.client.users.fetch(ticket.openerId).catch(() => null);
    if (opener) {
      await opener.send({
        content: lang === "en"
          ? `Your ticket **#${channel.name}** in **${guild.name}** was closed. Attached is the transcript.`
          : `Tu ticket **#${channel.name}** en **${guild.name}** fue cerrado. Adjunto el historial completo.`,
        files: [transcript.htmlAttachment, transcript.txtAttachment],
      }).catch((err) => {
        log.debug("No se pudo enviar transcript por DM", { err: err?.message });
      });
    }

    await channel.delete(`Ticket cerrado por ${closedByUser.tag || closedByUser.username}`).catch(() => {});
    return { ok: true, ticket, count: transcript.count };
  } finally {
    closingTickets.delete(channel.id);
  }
}

module.exports = {
  isValidMenuEmoji,
  getTicketConfig,
  updateTicketConfig,
  parseTicketMenuOptions,
  buildTicketPanelPayload,
  buildTicketControlCard,
  sendTicketSetupPanel,
  openTicket,
  generateTicketTranscript,
  closeTicketChannel,
};
