const {
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const mongoose = require("mongoose");
const { ComponentsV2Builder, V2Text } = require("gralonium");
const { RED, GREEN } = require("./config");
const { GuildConfig, Ticket } = require("./database");
const { getCurrentLang } = require("./i18n");
const { Logger } = require("./runtime");

const log = new Logger("TICKETS", process.env.LOG_LEVEL);

async function getTicketConfig(guildId) {
  const defaults = {
    enabled: false,
    categoryId: null,
    logChannelId: null,
    supportRoleId: null,
    welcomeMessage: "Describe tu consulta y un miembro del equipo te atenderá pronto.",
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

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTicketPanelPayload({ title = null, description = null, category = "General", lang = "es" } = {}) {
  const isEn = lang === "en";
  const resolvedTitle = title || (isEn ? "Support Tickets" : "Soporte y Tickets");
  const resolvedDesc = description || (isEn
    ? "Press the button below to open a private ticket with our staff team."
    : "Pulsa el botón de abajo para abrir un canal privado con el equipo de soporte.");

  const builder = new ComponentsV2Builder({ color: RED })
    .addText(`${V2Text.heading(resolvedTitle, 3, 200)}\n${resolvedDesc}`)
    .addSpacer("small")
    .addButtonsRow([
      {
        customId: `tkt:open:${String(category || "General").slice(0, 40)}`,
        emoji: "🎫",
        label: isEn ? "Open ticket" : "Abrir ticket",
        style: "danger",
      },
    ]);
  builder._i18nLang = lang;
  return builder.toPayload();
}

function buildTicketControlCard({ ticket, openerUser, category, welcomeMsg, lang = "es" }) {
  const isEn = lang === "en";
  const builder = new ComponentsV2Builder({ color: RED })
    .addText(
      `${V2Text.heading(`Ticket #${String(ticket.number).padStart(4, "0")}`, 3)}\n` +
      `${V2Text.subtext(`${category} · <@${openerUser.id}>`)}`
    )
    .addSeparator("small")
    .addText(welcomeMsg)
    .addSpacer("small")
    .addButtonsRow([
      {
        customId: "tkt:claim",
        emoji: "🙋",
        label: isEn ? "Claim" : "Reclamar",
        style: "secondary",
      },
      {
        customId: "tkt:transcript",
        emoji: "📄",
        label: isEn ? "Transcript" : "Transcripción",
        style: "secondary",
      },
      {
        customId: "tkt:close",
        emoji: "🔒",
        label: isEn ? "Close" : "Cerrar",
        style: "danger",
      },
    ]);
  builder._i18nLang = lang;
  return builder;
}

async function openTicket({ guild, user, category = "General" }) {
  if (!guild?.id || !user?.id || mongoose.connection.readyState !== 1) return { error: "unavailable" };

  const existing = await Ticket.findOne({ guildId: guild.id, openerId: user.id, status: "open" }).lean().catch(() => null);
  if (existing) {
    const ch = guild.channels.cache.get(existing.channelId) ?? await guild.channels.fetch(existing.channelId).catch(() => null);
    if (ch) return { error: "already_open", channelId: ch.id };
    await Ticket.updateOne({ channelId: existing.channelId }, { $set: { status: "closed" } }).catch(() => {});
  }

  const updatedGuild = await GuildConfig.findOneAndUpdate(
    { guildId: guild.id },
    { $inc: { "ticketConfig.counter": 1 }, $set: { "ticketConfig.enabled": true } },
    { upsert: true, returnDocument: "after" }
  ).lean();

  const cfg = updatedGuild?.ticketConfig ?? {};
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
  const meId = guild.members.me?.id ?? guild.client?.user?.id;
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
  if (cfg.supportRoleId && guild.roles.cache.has(cfg.supportRoleId)) {
    overwrites.push({
      id: cfg.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  const parent = cfg.categoryId && guild.channels.cache.has(cfg.categoryId) ? cfg.categoryId : undefined;
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites: overwrites,
    reason: `Ticket #${ticketNum} abierto por ${user.tag || user.username}`,
  });

  const ticket = await Ticket.create({
    guildId: guild.id,
    channelId: channel.id,
    openerId: user.id,
    number: ticketNum,
    category: String(category || "General").slice(0, 80),
    status: "open",
  });

  const lang = getCurrentLang();
  const controlCard = buildTicketControlCard({
    ticket,
    openerUser: user,
    category: ticket.category,
    welcomeMsg: cfg.welcomeMessage || "Describe tu consulta y un miembro del equipo te atenderá pronto.",
    lang,
  });

  const mentionPing = cfg.supportRoleId ? `<@${user.id}> <@&${cfg.supportRoleId}>` : `<@${user.id}>`;
  await channel.send(controlCard.toPayload()).catch(() => {});
  await channel.send({ content: mentionPing, allowedMentions: { users: [user.id], roles: cfg.supportRoleId ? [cfg.supportRoleId] : [] } }).catch(() => {});

  return { ok: true, channel, ticket };
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
}

module.exports = {
  getTicketConfig,
  updateTicketConfig,
  buildTicketPanelPayload,
  buildTicketControlCard,
  openTicket,
  generateTicketTranscript,
  closeTicketChannel,
};
