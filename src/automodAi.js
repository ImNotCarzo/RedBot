const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  ChannelSelectMenuBuilder,
  ChannelType,
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  LabelBuilder,
  ModalBuilder,
  RadioGroupBuilder,
  RadioGroupOptionBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { ComponentsV2Builder, V2Text } = require("gralonium");
const { generateJson } = require("./ai");
const { GREEN, RED, YELLOW } = require("./config");
const { logAction } = require("./guild");
const { isObfuscatedChannel } = require("./runtime");

const TRIGGER_QUOTAS = {
  [AutoModerationRuleTriggerType.Keyword]: 6,
  [AutoModerationRuleTriggerType.Spam]: 1,
  [AutoModerationRuleTriggerType.KeywordPreset]: 1,
  [AutoModerationRuleTriggerType.MentionSpam]: 1,
};

const TRIGGER_LABELS = {
  [AutoModerationRuleTriggerType.Keyword]: "Palabras clave / Regex",
  [AutoModerationRuleTriggerType.Spam]: "Anti-Spam nativo",
  [AutoModerationRuleTriggerType.KeywordPreset]: "Presets de Discord",
  [AutoModerationRuleTriggerType.MentionSpam]: "Spam de menciones",
};

const PRESET_MAP = {
  1: AutoModerationRuleKeywordPresetType.Profanity,
  profanity: AutoModerationRuleKeywordPresetType.Profanity,
  insultos: AutoModerationRuleKeywordPresetType.Profanity,
  2: AutoModerationRuleKeywordPresetType.SexualContent,
  sexualcontent: AutoModerationRuleKeywordPresetType.SexualContent,
  sexual: AutoModerationRuleKeywordPresetType.SexualContent,
  nsfw: AutoModerationRuleKeywordPresetType.SexualContent,
  3: AutoModerationRuleKeywordPresetType.Slurs,
  slurs: AutoModerationRuleKeywordPresetType.Slurs,
  odio: AutoModerationRuleKeywordPresetType.Slurs,
};

const PRESET_NAMES = {
  [AutoModerationRuleKeywordPresetType.Profanity]: "Insultos / Profanity",
  [AutoModerationRuleKeywordPresetType.SexualContent]: "Contenido sexual",
  [AutoModerationRuleKeywordPresetType.Slurs]: "Discurso de odio / Slurs",
};

const INCIDENT_DURATIONS_MS = {
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

function isDiscordSafeRegex(pattern) {
  if (typeof pattern !== "string" || !pattern.length || pattern.length > 260) return false;
  // Discord utiliza motor regex basado en Rust (sin lookarounds ni backreferences)
  if (/\(\?[=!<]/.test(pattern)) return false;
  if (/\\[1-9]/.test(pattern)) return false;
  if (/\([^)]*[+*?]\)[+*?{]/.test(pattern)) return false;
  if (/\([^)]*\|[^)]*\)[+*?{]/.test(pattern)) return false;
  if (/(\.\*){2,}|(\.\+){2,}/.test(pattern)) return false;
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

function normalizeTriggerType(raw) {
  if (typeof raw === "number" && TRIGGER_QUOTAS[raw]) return raw;
  const key = String(raw ?? "").trim().toLowerCase();
  if (key === "spam" || key === "antispam" || key === "3") return AutoModerationRuleTriggerType.Spam;
  if (key === "keyword_preset" || key === "keywordpreset" || key === "preset" || key === "presets" || key === "4") {
    return AutoModerationRuleTriggerType.KeywordPreset;
  }
  if (key === "mention_spam" || key === "mentionspam" || key === "mentions" || key === "5") {
    return AutoModerationRuleTriggerType.MentionSpam;
  }
  return AutoModerationRuleTriggerType.Keyword;
}

function cleanStringList(arr, maxLen, maxItems) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const clean = String(item ?? "").trim().slice(0, maxLen);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function validateAndNormalizeRuleSpec(
  raw,
  { guild, instruction = "", alertChannel = null, exemptRole = null, exemptChannel = null, defaultAlertChannelId = null } = {}
) {
  if (!raw || typeof raw !== "object") return { error: "invalid_spec" };

  const warnings = [];
  const triggerType = normalizeTriggerType(raw.triggerType ?? raw.trigger_type);
  const name = String(raw.name ?? "Regla AutoMod").trim().slice(0, 100) || "Regla AutoMod";

  const triggerMetadata = {};
  if (triggerType === AutoModerationRuleTriggerType.Keyword) {
    const keywordFilter = cleanStringList(raw.keywordFilter ?? raw.keyword_filter ?? raw.keywords, 60, 40);
    const rawRegex = Array.isArray(raw.regexPatterns ?? raw.regex_patterns ?? raw.regex)
      ? (raw.regexPatterns ?? raw.regex_patterns ?? raw.regex)
      : [];
    const regexPatterns = [];
    for (const p of rawRegex) {
      const s = String(p ?? "").trim();
      if (!s) continue;
      if (isDiscordSafeRegex(s)) {
        if (!regexPatterns.includes(s)) regexPatterns.push(s);
        if (regexPatterns.length >= 10) break;
      } else {
        warnings.push(`Regex descartada por compatibilidad de Discord: \`${V2Text.clip(s, 40)}\``);
      }
    }
    const allowList = cleanStringList(raw.allowList ?? raw.allow_list, 60, 30);

    if (!keywordFilter.length && !regexPatterns.length) {
      return { error: "empty_trigger" };
    }
    if (keywordFilter.length) triggerMetadata.keywordFilter = keywordFilter;
    if (regexPatterns.length) triggerMetadata.regexPatterns = regexPatterns;
    if (allowList.length) triggerMetadata.allowList = allowList;
  } else if (triggerType === AutoModerationRuleTriggerType.KeywordPreset) {
    const rawPresets = Array.isArray(raw.presets) ? raw.presets : [];
    const presets = [...new Set(
      rawPresets
        .map((p) => PRESET_MAP[String(p ?? "").trim().toLowerCase()] ?? PRESET_MAP[Number(p)])
        .filter(Boolean)
    )];
    triggerMetadata.presets = presets.length
      ? presets
      : [
          AutoModerationRuleKeywordPresetType.Profanity,
          AutoModerationRuleKeywordPresetType.SexualContent,
          AutoModerationRuleKeywordPresetType.Slurs,
        ];
    const allowList = cleanStringList(raw.allowList ?? raw.allow_list, 60, 30);
    if (allowList.length) triggerMetadata.allowList = allowList;
  } else if (triggerType === AutoModerationRuleTriggerType.MentionSpam) {
    const limitNum = Number.parseInt(raw.mentionTotalLimit ?? raw.mention_total_limit ?? 5, 10);
    triggerMetadata.mentionTotalLimit = Math.min(50, Math.max(1, Number.isFinite(limitNum) ? limitNum : 5));
    triggerMetadata.mentionRaidProtectionEnabled = Boolean(raw.mentionRaidProtectionEnabled ?? raw.mention_raid_protection_enabled ?? true);
  }

  let blockMessage = raw.blockMessage !== false;
  const customMessage = String(raw.customMessage ?? raw.custom_message ?? "").trim().slice(0, 150);

  let timeoutSeconds = null;
  const rawTimeout = Number.parseInt(raw.timeoutSeconds ?? raw.timeout_seconds ?? 0, 10);
  if (Number.isFinite(rawTimeout) && rawTimeout > 0) {
    if (triggerType === AutoModerationRuleTriggerType.Keyword || triggerType === AutoModerationRuleTriggerType.MentionSpam) {
      timeoutSeconds = Math.min(2419200, Math.max(60, rawTimeout));
    } else {
      warnings.push("Discord no permite Timeout automático en reglas de Spam o Preset; se omitió el timeout.");
    }
  }

  const candidateAlertId = alertChannel?.id ?? raw.alertChannelId ?? raw.alert_channel_id ?? defaultAlertChannelId ?? null;
  const resolvedAlertCh = candidateAlertId && guild?.channels?.cache
    ? guild.channels.cache.get(String(candidateAlertId))
    : null;
  const validAlertId =
    resolvedAlertCh && !isObfuscatedChannel(resolvedAlertCh) && resolvedAlertCh.isTextBased?.() && resolvedAlertCh.type !== ChannelType.GuildCategory
      ? resolvedAlertCh.id
      : null;

  let sendAlert = Boolean(raw.sendAlert ?? validAlertId);
  if (sendAlert && !validAlertId) {
    sendAlert = false;
    warnings.push("No se especificó canal de alertas ni hay Drama Watcher/Logs configurado; se omitió la alerta.");
  }

  if (!blockMessage && !sendAlert && !timeoutSeconds) {
    blockMessage = true;
  }

  const rawRoleIds = [
    ...(exemptRole?.id ? [exemptRole.id] : []),
    ...[...String(instruction).matchAll(/<@&(\d{17,22})>/g)].map((m) => m[1]),
    ...(Array.isArray(raw.exemptRoleIds ?? raw.exempt_role_ids) ? (raw.exemptRoleIds ?? raw.exempt_role_ids) : []),
  ];
  const exemptRoleIds = [...new Set(rawRoleIds.map(String))].filter((id) => {
    if (!guild?.roles?.cache) return false;
    if (id === guild.id) return false;
    return guild.roles.cache.has(id);
  }).slice(0, 20);

  const rawChannelIds = [
    ...(exemptChannel?.id ? [exemptChannel.id] : []),
    ...[...String(instruction).matchAll(/<#(\d{17,22})>/g)].map((m) => m[1]),
    ...(Array.isArray(raw.exemptChannelIds ?? raw.exempt_channel_ids) ? (raw.exemptChannelIds ?? raw.exempt_channel_ids) : []),
  ];
  const exemptChannelIds = [...new Set(rawChannelIds.map(String))].filter((id) => {
    if (!guild?.channels?.cache) return false;
    const ch = guild.channels.cache.get(id);
    return Boolean(ch && !isObfuscatedChannel(ch));
  }).slice(0, 50);

  return {
    ok: true,
    warnings,
    spec: {
      name,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType,
      triggerMetadata,
      blockMessage,
      customMessage,
      sendAlert,
      alertChannelId: validAlertId,
      timeoutSeconds,
      exemptRoleIds,
      exemptChannelIds,
      enabled: true,
    },
  };
}

function buildNativeActionsFromSpec(spec) {
  const actions = [];
  if (spec.blockMessage) {
    actions.push({
      type: AutoModerationActionType.BlockMessage,
      ...(spec.customMessage ? { metadata: { customMessage: spec.customMessage.slice(0, 150) } } : {}),
    });
  }
  if (spec.sendAlert && spec.alertChannelId) {
    actions.push({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: spec.alertChannelId },
    });
  }
  if (
    spec.timeoutSeconds &&
    (spec.triggerType === AutoModerationRuleTriggerType.Keyword ||
      spec.triggerType === AutoModerationRuleTriggerType.MentionSpam)
  ) {
    actions.push({
      type: AutoModerationActionType.Timeout,
      metadata: { durationSeconds: spec.timeoutSeconds },
    });
  }
  if (!actions.length) {
    actions.push({ type: AutoModerationActionType.BlockMessage });
  }
  return actions;
}

function buildNativeRulePayload(spec) {
  return {
    name: spec.name.slice(0, 100),
    eventType: spec.eventType ?? AutoModerationRuleEventType.MessageSend,
    triggerType: spec.triggerType,
    triggerMetadata: spec.triggerMetadata ?? {},
    actions: buildNativeActionsFromSpec(spec),
    enabled: spec.enabled !== false,
    exemptRoles: spec.exemptRoleIds ?? [],
    exemptChannels: spec.exemptChannelIds ?? [],
    reason: "RedBot AutoMod AI",
  };
}

function buildNativeRuleEditPayload(spec) {
  const { triggerType: _ignored, ...rest } = buildNativeRulePayload(spec);
  return rest;
}

async function compileNaturalLanguageRule({
  guild,
  instruction,
  alertChannel = null,
  exemptRole = null,
  exemptChannel = null,
  defaultAlertChannelId = null,
}) {
  const rolesRef = [...(guild?.roles?.cache?.values?.() ?? [])]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
    .slice(0, 35)
    .map((r) => `${r.name}:${r.id}`);

  const channelsRef = [...(guild?.channels?.cache?.values?.() ?? [])]
    .filter((c) => !isObfuscatedChannel(c) && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement || c.type === ChannelType.GuildForum))
    .slice(0, 35)
    .map((c) => `#${c.name}:${c.id}`);

  const prompt =
    `You translate a Discord server moderator's natural-language moderation request into a Discord Native AutoMod rule JSON specification.\n` +
    `Respond ONLY with valid JSON matching this schema (no markdown fences):\n` +
    `{\n` +
    `  "name": "short rule name <= 60 chars (Spanish if instruction is Spanish)",\n` +
    `  "triggerType": "KEYWORD" | "SPAM" | "KEYWORD_PRESET" | "MENTION_SPAM",\n` +
    `  "keywordFilter": ["*discord.gg/*", "word"],\n` +
    `  "regexPatterns": ["Rust-compatible regex without lookarounds (?=...) or backrefs \\\\1"],\n` +
    `  "presets": ["PROFANITY" | "SEXUAL_CONTENT" | "SLURS"],\n` +
    `  "allowList": ["optional safe exemptions"],\n` +
    `  "mentionTotalLimit": 5,\n` +
    `  "mentionRaidProtectionEnabled": true,\n` +
    `  "blockMessage": true,\n` +
    `  "customMessage": "short friendly reason <= 140 chars shown to user when blocked (optional)",\n` +
    `  "timeoutSeconds": 0,\n` +
    `  "sendAlert": true,\n` +
    `  "exemptRoleIds": ["matching role IDs from reference if requested"],\n` +
    `  "exemptChannelIds": ["matching channel IDs from reference if requested"]\n` +
    `}\n` +
    `Rules:\n` +
    `- KEYWORD uses keywordFilter (supports * wildcards like "*bit.ly/*", "*free nitro*") and/or Rust-safe regexPatterns.\n` +
    `- SPAM detects generic Discord spam (timeoutSeconds MUST be 0 on SPAM/KEYWORD_PRESET).\n` +
    `- KEYWORD_PRESET is for Discord's built-in Profanity/Sexual/Slurs wordlists.\n` +
    `- MENTION_SPAM limits total mentions per message (mentionTotalLimit 1..50).\n` +
    `- Never invent role or channel IDs that are not in the reference lists or mentions.\n` +
    `Server roles: ${JSON.stringify(rolesRef)}\n` +
    `Server channels: ${JSON.stringify(channelsRef)}\n` +
    `Moderator instruction: ${JSON.stringify(String(instruction ?? "").slice(0, 500))}`;

  const raw = await generateJson(prompt, { temperature: 0.1 });
  if (!raw) return { error: "ai_failed" };

  return validateAndNormalizeRuleSpec(raw, {
    guild,
    instruction,
    alertChannel,
    exemptRole,
    exemptChannel,
    defaultAlertChannelId,
  });
}

function buildNativeRulePreviewCard(spec, { sameTypeCount = 0, existingRuleName = null, warnings = [], controls = null, color = RED } = {}) {
  const quota = TRIGGER_QUOTAS[spec.triggerType] ?? 1;
  const meta = spec.triggerMetadata ?? {};
  const details = [];

  if (meta.keywordFilter?.length) {
    details.push(`**Palabras/Patrones (${meta.keywordFilter.length}):** ${V2Text.clip(meta.keywordFilter.map((k) => `\`${k}\``).join(", "), 450)}`);
  }
  if (meta.regexPatterns?.length) {
    details.push(`**Regex (${meta.regexPatterns.length}):** ${V2Text.clip(meta.regexPatterns.map((r) => `\`${r}\``).join(", "), 350)}`);
  }
  if (meta.presets?.length) {
    details.push(`**Presets:** ${meta.presets.map((p) => PRESET_NAMES[p] ?? p).join(", ")}`);
  }
  if (meta.mentionTotalLimit) {
    details.push(`**Límite de menciones:** \`${meta.mentionTotalLimit}\`${meta.mentionRaidProtectionEnabled ? " · Anti-raid de menciones activo" : ""}`);
  }
  if (meta.allowList?.length) {
    details.push(`**Lista blanca (${meta.allowList.length}):** ${V2Text.clip(meta.allowList.map((a) => `\`${a}\``).join(", "), 220)}`);
  }
  if (!details.length && spec.triggerType === AutoModerationRuleTriggerType.Spam) {
    details.push("**Filtro:** Detección nativa de spam de Discord (0 ms latencia)");
  }

  const actionsList = [
    spec.blockMessage ? "Bloquear mensaje" : null,
    spec.sendAlert && spec.alertChannelId ? `Alerta en <#${spec.alertChannelId}>` : null,
    spec.timeoutSeconds ? `Timeout \`${spec.timeoutSeconds}s\`` : null,
  ].filter(Boolean);

  const slotLabel = existingRuleName
    ? `Reemplazará a "${existingRuleName}" (${sameTypeCount}/${quota})`
    : `Cupo usado: ${sameTypeCount}/${quota}`;

  const builder = new ComponentsV2Builder({ color })
    .addText(`${V2Text.heading(`AutoMod Nativo · ${V2Text.clip(spec.name, 70)}`, 3)}\n${V2Text.subtext(`${TRIGGER_LABELS[spec.triggerType] ?? "Regla"} · ${slotLabel}`)}`)
    .addSeparator("small")
    .addFields([
      ["Acciones", actionsList.join(" · ") || "Bloquear mensaje"],
      spec.customMessage ? ["Aviso al usuario", V2Text.clip(spec.customMessage, 150)] : null,
      spec.exemptRoleIds?.length ? ["Roles exentos", spec.exemptRoleIds.map((id) => `<@&${id}>`).join(", ")] : null,
      spec.exemptChannelIds?.length ? ["Canales exentos", spec.exemptChannelIds.map((id) => `<#${id}>`).join(", ")] : null,
    ].filter(Boolean))
    .addSeparator("small")
    .addText(details.join("\n"));

  if (warnings.length) {
    builder.addSpacer("small").addText(`⚠️ ${warnings.join("\n⚠️ ")}`);
  }
  if (controls?.length) {
    builder.addSpacer("small").addButtonsRow(controls, { autoWrap: true });
  }
  return builder;
}

function buildAutoModEditModal(customId, spec) {
  const canTimeout =
    spec.triggerType === AutoModerationRuleTriggerType.Keyword ||
    spec.triggerType === AutoModerationRuleTriggerType.MentionSpam;

  const actionOptions = [
    new CheckboxGroupOptionBuilder()
      .setLabel("Bloquear mensaje")
      .setValue("block")
      .setDescription("Impide que el mensaje se publique en el chat")
      .setDefault(Boolean(spec.blockMessage)),
    new CheckboxGroupOptionBuilder()
      .setLabel("Enviar alerta al canal")
      .setValue("alert")
      .setDescription(spec.alertChannelId ? "Notifica en el canal de alertas configurado" : "Requiere canal de alertas/logs configurado")
      .setDefault(Boolean(spec.sendAlert && spec.alertChannelId)),
  ];

  if (canTimeout) {
    actionOptions.push(
      new CheckboxGroupOptionBuilder()
        .setLabel("Timeout 5m automático")
        .setValue("timeout")
        .setDescription("Silencia temporalmente al infractor")
        .setDefault(Boolean(spec.timeoutSeconds))
    );
  }

  const customMsgInput = new TextInputBuilder()
    .setCustomId("custom_message")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(150)
    .setPlaceholder("Aviso que verá el infractor (opcional)");
  if (spec.customMessage) customMsgInput.setValue(spec.customMessage.slice(0, 150));

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("exempt_roles")
    .setPlaceholder("Roles que ignorarán esta regla...")
    .setMinValues(0)
    .setMaxValues(10)
    .setRequired(false);
  if (spec.exemptRoleIds?.length) roleSelect.setDefaultRoles(spec.exemptRoleIds.slice(0, 10));

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId("exempt_channels")
    .setPlaceholder("Canales que ignorarán esta regla...")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
    .setMinValues(0)
    .setMaxValues(10)
    .setRequired(false);
  if (spec.exemptChannelIds?.length) channelSelect.setDefaultChannels(spec.exemptChannelIds.slice(0, 10));

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Ajustar regla AutoMod")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Nombre de la regla")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setValue(spec.name.slice(0, 100))
        ),
      new LabelBuilder()
        .setLabel("Mensaje al bloquear (opcional)")
        .setTextInputComponent(customMsgInput),
      new LabelBuilder()
        .setLabel("Acciones de la regla")
        .setCheckboxGroupComponent(
          new CheckboxGroupBuilder()
            .setCustomId("actions")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(actionOptions.length)
            .addOptions(...actionOptions)
        ),
      new LabelBuilder()
        .setLabel("Roles exentos (opcional)")
        .setRoleSelectMenuComponent(roleSelect),
      new LabelBuilder()
        .setLabel("Canales exentos (opcional)")
        .setChannelSelectMenuComponent(channelSelect)
    );
}

function buildIncidentActionsModal(customId, guild, lang = "es") {
  const isEn = lang === "en";
  const now = Date.now();
  const invUntil = guild?.incidentsData?.invitesDisabledUntil;
  const dmsUntil = guild?.incidentsData?.dmsDisabledUntil;
  const invActive = Boolean(invUntil && new Date(invUntil).getTime() > now);
  const dmsActive = Boolean(dmsUntil && new Date(dmsUntil).getTime() > now);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(isEn ? "Security Incident Actions" : "Acciones de Seguridad")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(isEn ? "Protections to update" : "Protecciones a aplicar")
        .setCheckboxGroupComponent(
          new CheckboxGroupBuilder()
            .setCustomId("scopes")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(2)
            .addOptions(
              new CheckboxGroupOptionBuilder()
                .setLabel(isEn ? "Pause server invites" : "Pausar invitaciones del servidor")
                .setValue("invites")
                .setDescription(invActive ? (isEn ? "Currently paused" : "Actualmente pausadas") : (isEn ? "Block new joins via invites" : "Bloquea entradas por invitación"))
                .setDefault(true),
              new CheckboxGroupOptionBuilder()
                .setLabel(isEn ? "Pause member DMs" : "Pausar DMs entre miembros")
                .setValue("dms")
                .setDescription(dmsActive ? (isEn ? "Currently paused" : "Actualmente pausados") : (isEn ? "Block server member DMs" : "Bloquea mensajes privados entre miembros"))
                .setDefault(true)
            )
        ),
      new LabelBuilder()
        .setLabel(isEn ? "Duration" : "Duración de la medida")
        .setRadioGroupComponent(
          new RadioGroupBuilder()
            .setCustomId("duration")
            .setRequired(true)
            .addOptions(
              new RadioGroupOptionBuilder().setLabel(isEn ? "30 minutes" : "30 minutos").setValue("30m"),
              new RadioGroupOptionBuilder().setLabel(isEn ? "1 hour" : "1 hora").setValue("1h").setDefault(true),
              new RadioGroupOptionBuilder().setLabel(isEn ? "6 hours" : "6 horas").setValue("6h"),
              new RadioGroupOptionBuilder().setLabel(isEn ? "24 hours (maximum)" : "24 horas (máximo)").setValue("24h"),
              new RadioGroupOptionBuilder().setLabel(isEn ? "Disable / restore normal" : "Desactivar / restaurar normalidad").setValue("clear")
            )
        )
    );
}

async function applyIncidentActionsFromModal({ submitted, guild, moderator }) {
  const scopes = submitted.fields.getCheckboxGroup("scopes") ?? [];
  const durationKey = submitted.fields.getRadioGroup("duration");
  const isClear = durationKey === "clear";
  const ms = INCIDENT_DURATIONS_MS[durationKey] ?? 60 * 60_000;
  const targetUntil = isClear ? null : new Date(Date.now() + ms);

  const curInv = guild.incidentsData?.invitesDisabledUntil ?? null;
  const curDms = guild.incidentsData?.dmsDisabledUntil ?? null;

  const invitesDisabledUntil = scopes.includes("invites") ? targetUntil : curInv;
  const dmsDisabledUntil = scopes.includes("dms") ? targetUntil : curDms;

  const updated = await guild.setIncidentActions({
    invitesDisabledUntil,
    dmsDisabledUntil,
  });

  const modTag = moderator?.tag ?? moderator?.username ?? "Moderador";
  await logAction(guild, {
    title: isClear ? "Incidentes de seguridad restaurados" : "Alerta de seguridad activada",
    color: isClear ? GREEN : YELLOW,
    fields: [
      { name: "Moderador", value: modTag, inline: true },
      { name: "Alcance", value: scopes.map((s) => (s === "invites" ? "Invitaciones" : "DMs")).join(", "), inline: true },
      { name: "Estado", value: isClear ? "Normalidad restaurada" : `Hasta <t:${Math.floor(targetUntil.getTime() / 1000)}:R>`, inline: true },
    ],
  }).catch(() => {});

  return {
    ok: true,
    cleared: isClear,
    scopes,
    invitesDisabledUntil: updated?.invitesDisabledUntil ?? invitesDisabledUntil,
    dmsDisabledUntil: updated?.dmsDisabledUntil ?? dmsDisabledUntil,
  };
}

module.exports = {
  TRIGGER_QUOTAS,
  TRIGGER_LABELS,
  buildNativeRulePayload,
  buildNativeRuleEditPayload,
  compileNaturalLanguageRule,
  buildNativeRulePreviewCard,
  buildAutoModEditModal,
  buildIncidentActionsModal,
  applyIncidentActionsFromModal,
};
