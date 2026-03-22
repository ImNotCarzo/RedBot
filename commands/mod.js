const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("erine");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const Log = require("../models/Log");
const Warn = require("../models/Warn");
const TempBan = require("../models/TempBan");

const { RED, YELLOW, GREEN, BLUE } = require("../utils/colors");
const { generateId, parseDuration, formatDuration, scheduleTempUnban } = require("../utils/helpers");
const sendLog = require("../utils/sendLog");

function buildPagRow(prevId, nextId, page, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page === total - 1)
  );
}
// ─────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────

const data = {
  data: new GroupBuilder({
    name: "mod",
    description: "Comandos de moderación",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })

  // ── BAN ──────────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "ban",
    description: "Banea a un usuario del servidor",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario", description: "Usuario a banear", required: true })
    .addString({ name: "razon", description: "Razón del ban", required: false })
    .addString({ name: "dias", description: "Días de mensajes a borrar (0-7)", required: false }),

  async code(ctx) {
    const member  = ctx.get("usuario");
    const reason  = ctx.get("razon") ?? "Sin razón";
    const daysRaw = ctx.get("dias");
    const days    = daysRaw ? Math.min(7, Math.max(0, parseInt(daysRaw) || 0)) : 0;

    if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
      return ctx.send({ content: "No tienes el permiso `BanMembers`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return ctx.send({ content: "No tengo permiso para banear", flags: MessageFlags.Ephemeral });

    if (member.id === ctx.guild.ownerId)
      return ctx.send({ content: "No puedo banear al dueño del servidor", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.guild.members.me.roles.highest.position)
      return ctx.send({ content: "No puedo banear a alguien con igual o mayor rango que el mío", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.member.roles.highest.position)
      return ctx.send({ content: "No puedes banear a alguien con igual o mayor rango que el tuyo", flags: MessageFlags.Ephemeral });

    try {
      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setDescription(`Fuiste baneado de **${ctx.guild.name}**${reason ? `\nRazón: ${reason}` : ""}`)
            .setTimestamp(),
        ],
      }).catch(() => {});

      await member.ban({ deleteMessageDays: days, reason: `${ctx.user?.tag ?? ctx.author?.tag}${reason ? `: ${reason}` : ""}` });

      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue baneado`)
        .setColor(RED)

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario baneado")
        .setColor(RED)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`,   inline: true },
          ...(reason ? [{ name: "Razón", value: reason, inline: false }] : []),
          { name: "Mensajes borrados", value: `${days} días`, inline: true }
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);

    } catch {
      await ctx.send({ content: "No pude banear al usuario", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── UNBAN ─────────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "unban",
    description: "Desbanea a un usuario por ID",
  }),
  params: new ParamsBuilder()
    .addString({ name: "id", description: "ID del usuario", required: true })
    .addString({ name: "razon", description: "Razón del desbaneo", required: false }),

  async code(ctx) {
    const userId = ctx.get("id");
    const reason = ctx.get("razon") ?? "Sin razón";

    if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
      return ctx.send({ content: "No tienes el permiso `BanMembers`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return ctx.send({ content: "No tengo permiso para desbanear", flags: MessageFlags.Ephemeral });

    try {
      const ban = await ctx.guild.bans.fetch(userId).catch(() => null);
      if (!ban)
        return ctx.send({ content: "Ese usuario no está baneado", flags: MessageFlags.Ephemeral });

      await ban.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(GREEN)
            .setDescription(`Fuiste desbaneado de **${ctx.guild.name}**${reason ? `\nRazón: ${reason}` : ""}`)
        ],
      }).catch(() => {});

      await ctx.guild.members.unban(userId, `${ctx.user?.tag ?? ctx.author?.tag}${reason ? `: ${reason}` : ""}`);

      const username = ban.user.globalName || ban.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue desbaneado`)
        .setColor(GREEN)

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario desbaneado")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario",   value: `${ban.user.tag} (\`${userId}\`)`, inline: true },
          { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`, inline: true },
          ...(reason ? [{ name: "Razón", value: reason, inline: false }] : [])
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);

    } catch {
      await ctx.send({ content: "No se pudo desbanear al usuario. Verifica que el ID sea correcto", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── SOFTBAN ───────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "softban",
    description: "Banea y desbanea al instante para borrar mensajes recientes",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario", description: "Usuario a softbanear", required: true })
    .addString({ name: "razon",   description: "Razón",                           required: false })
    .addString({ name: "dias",    description: "Días de mensajes a borrar (1-7)", required: false }),

  async code(ctx) {
    const isSlash = !!ctx.interaction;
    if (isSlash) await ctx.interaction.deferReply();

    const send = (payload) => isSlash
      ? ctx.interaction.editReply(payload)
      : ctx.send(payload);

    const member  = ctx.get("usuario");
    const reason  = ctx.get("razon") ?? "Sin razón";
    const daysRaw = ctx.get("dias");
    const days    = daysRaw ? Math.min(7, Math.max(1, parseInt(daysRaw) || 7)) : 7;

    if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
      return send({ content: "No tienes el permiso `BanMembers`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return send({ content: "No tengo permiso para banear", flags: MessageFlags.Ephemeral });

    if (member.id === ctx.guild.ownerId)
      return send({ content: "No puedo softbanear al dueño del servidor", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.guild.members.me.roles.highest.position)
      return send({ content: "No puedo actuar sobre alguien con igual o mayor rango que el mío", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.member.roles.highest.position)
      return send({ content: "No puedes actuar sobre alguien con igual o mayor rango que el tuyo", flags: MessageFlags.Ephemeral });

    try {
      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setDescription(`Fuiste softbaneado de **${ctx.guild.name}**\nRazón: ${reason}`)
        ],
      }).catch(() => {});

      await member.ban({
        deleteMessageSeconds: days * 24 * 60 * 60,
        reason: `[SOFTBAN] ${ctx.user?.tag ?? ctx.author?.tag}${reason ? `: ${reason}` : ""}`,
      });
      await ctx.guild.members.unban(member.id, `[SOFTBAN] ${ctx.user?.tag ?? ctx.author?.tag}`);

      const username = member.user.globalName || member.user.username;

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue softbaneado`)
        .setColor(RED)

      await send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario softbaneado")
        .setColor(RED)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`,   inline: true },
          { name: "Razón",     value: reason,                                   inline: false },
          { name: "Mensajes",  value: `${days} días borrados`,                  inline: true },
        )
        .setFooter({ text: "El usuario puede volver a entrar al servidor" })
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);
    } catch {
      await send({ content: "No pude softbanear al usuario", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── TEMPBAN ───────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "tempban",
    description: "Banea a un usuario por un tiempo determinado",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario",  description: "Usuario a banear",            required: true })
    .addString({ name: "duracion", description: "Duración (ej: 1h, 30m, 2d)", required: true })
    .addString({ name: "razon",    description: "Razón",                        required: false }),

  async code(ctx) {
    const isSlash = !!ctx.interaction;
    if (isSlash) await ctx.interaction.deferReply();

    const send = (payload) => isSlash
      ? ctx.interaction.editReply(payload)
      : ctx.send(payload);

    const member   = ctx.get("usuario");
    const durStr   = ctx.get("duracion");
    const reason   = ctx.get("razon") ?? "Sin razón";
    const duration = parseDuration(durStr);

    if (!duration)
      return send({ content: "Duración inválida. Usa: `30s`, `10m`, `2h`, `1d`", flags: MessageFlags.Ephemeral });

    if (duration > 28 * 86_400_000)
      return send({ content: "La duración máxima es 28 días", flags: MessageFlags.Ephemeral });

    if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
      return send({ content: "No tienes el permiso `BanMembers`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return send({ content: "No tengo permiso para banear", flags: MessageFlags.Ephemeral });

    if (member.id === ctx.guild.ownerId)
      return send({ content: "No puedo banear al dueño del servidor", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.guild.members.me.roles.highest.position)
      return send({ content: "No puedo actuar sobre alguien con igual o mayor rango que el mío", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.member.roles.highest.position)
      return send({ content: "No puedes actuar sobre alguien con igual o mayor rango que el tuyo", flags: MessageFlags.Ephemeral });

    try {
      const unbanAt  = new Date(Date.now() + duration);
      const username = member.user.globalName || member.user.username;
      const modTag   = ctx.user?.tag ?? ctx.author?.tag;
      await member.user.send({
  embeds: [
    new EmbedBuilder()
      .setColor(RED)
      .setDescription(`Fuiste tempbaneado de **${ctx.guild.name}**`)
      .addFields(
        { name: "Razón",    value: reason,                   inline: true },
        { name: "Duración", value: formatDuration(duration), inline: true },
      )
      .setTimestamp(),
  ],
}).catch(() => {});
      await member.ban({
        reason: `[TEMPBAN ${formatDuration(duration)}] ${modTag}: ${reason}`,
      });

      await TempBan.findOneAndUpdate(
        { guildId: ctx.guild.id, userId: member.id },
        { unbanAt },
        { upsert: true }
      );

      scheduleTempUnban(ctx.guild.client, ctx.guild.id, member.id, unbanAt);

      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue tempbaneado por **${formatDuration(duration)}**`)
        .setColor(RED)
        .setTimestamp();

      await send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario tempbaneado")
        .setColor(RED)
        .addFields(
          { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`,           inline: true },
          { name: "Moderador", value: modTag,                                              inline: true },
          { name: "Duración",  value: formatDuration(duration),                            inline: true },
          { name: "Expira",    value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`,    inline: true },
          { name: "Razón",     value: reason,                                              inline: false },
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);
    } catch {
      await send({ content: "No pude hacer el tempban", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── MASSBAN ───────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "massban",
    description: "Banea hasta 5 usuarios seleccionados",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario1", description: "Usuario 1", required: true })
    .addMember({ name: "usuario2", description: "Usuario 2", required: false })
    .addMember({ name: "usuario3", description: "Usuario 3", required: false })
    .addMember({ name: "usuario4", description: "Usuario 4", required: false })
    .addMember({ name: "usuario5", description: "Usuario 5", required: false })
    .addString({ name: "razon", description: "Razón", required: false }),

  async code(ctx) {
    const users = [
      ctx.get("usuario1"),
      ctx.get("usuario2"),
      ctx.get("usuario3"),
      ctx.get("usuario4"),
      ctx.get("usuario5"),
    ].filter(u => u); // eliminar nulos

    if (!users.length)
      return ctx.send({ content: "Debes seleccionar al menos un usuario", flags: MessageFlags.Ephemeral });

    const reason = ctx.get("razon") ?? "Sin razón";

    if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
      return ctx.send({ content: "No tienes el permiso `BanMembers`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return ctx.send({ content: "No tengo permiso para banear", flags: MessageFlags.Ephemeral });

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
      return ctx.send({ content: "Necesitas `Administrator` para usar massban", flags: MessageFlags.Ephemeral });

    const banned = [];
    const failed = [];

    for (const member of users) {
      try {
        await member.user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(RED)
              .setDescription(`Fuiste baneado de **${ctx.guild.name}**${reason ? `\nRazón: ${reason}` : ""}`)
              .setTimestamp(),
          ],
        }).catch(() => {});

        await ctx.guild.members.ban(member, { reason: `[MASSBAN] ${ctx.user?.tag ?? ctx.author?.tag}${reason ? `: ${reason}` : ""}` });
        banned.push(member);
      } catch {
        failed.push(member);
      }
    }

    // Embed público
    const description = banned.map((m, i) => `${i + 1}. ${m.user.tag}`).join("\n") || "Ninguno";
    const publicEmbed = new EmbedBuilder()
      .setTitle("Usuarios baneados")
      .setDescription(`Los siguientes usuarios fueron baneados del servidor:\n${description}`)
      .setColor(RED)
      .setTimestamp();

    await ctx.send({ embeds: [publicEmbed] });

    // Embed para logs
    const logEmbed = new EmbedBuilder()
      .setTitle("Massban ejecutado")
      .setColor(RED)
      .addFields(
        { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`, inline: true },
        { name: "Baneados", value: `${banned.length}`, inline: true },
        { name: "Fallidos", value: `${failed.length}`, inline: true },
        ...(reason ? [{ name: "Razón", value: reason, inline: false }] : []),
      )
      .setTimestamp();

    if (failed.length)
      logEmbed.addFields({ name: "No se pudo banear a", value: failed.map(m => m.user.tag).join(", ") });

    await sendLog(ctx.guild, logEmbed);
  },
})

  // ── KICK ──────────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "kick",
    description: "Expulsa a un usuario del servidor",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario", description: "Usuario a expulsar", required: true })
    .addString({ name: "razon", description: "Razón", required: false }),

  async code(ctx) {
    const member = ctx.get("usuario");
    const reason = ctx.get("razon") ?? "Sin razón";

    if (!ctx.member.permissions.has(PermissionFlagsBits.KickMembers))
      return ctx.send({ content: "No tienes el permiso `KickMembers`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers))
      return ctx.send({ content: "No tengo permiso para expulsar", flags: MessageFlags.Ephemeral });

    if (member.id === ctx.guild.ownerId)
      return ctx.send({ content: "No puedo expulsar al dueño del servidor", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.guild.members.me.roles.highest.position)
      return ctx.send({ content: "No puedo expulsar a alguien con igual o mayor rango que el mío", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.member.roles.highest.position)
      return ctx.send({ content: "No puedes expulsar a alguien con igual o mayor rango que el tuyo", flags: MessageFlags.Ephemeral });

    try {
      const username = member.user.globalName || member.user.username;

      // DM al usuario antes de expulsar
      const dmEmbed = new EmbedBuilder()
        .setColor(YELLOW)
        .setDescription(`Fuiste expulsado de **${ctx.guild.name}**${reason ? `\nRazón: ${reason}` : ""}`)
        .setTimestamp();

      await member.user.send({ embeds: [dmEmbed] }).catch(() => {});

      await member.kick(`${ctx.user?.tag ?? ctx.author?.tag}${reason ? `: ${reason}` : ""}`);

      // mensaje simple en el servidor
      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue expulsado`)
        .setColor(YELLOW)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      // embed completo para logs
      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario expulsado")
        .setColor(YELLOW)
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`, inline: true },
          ...(reason ? [{ name: "Razón", value: reason, inline: false }] : []),
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);

    } catch {
      await ctx.send({ content: "No se pudo expulsar al usuario", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── MUTE (timeout) ────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "mute",
    description: "Silencia a un usuario",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario", description: "Usuario a silenciar", required: true })
    .addString({ name: "duracion", description: "Duración (ej: 10m, 1h, 1d)", required: true })
    .addString({ name: "razon", description: "Razón", required: false }),

  async code(ctx) {
    const member = ctx.get("usuario");
    const durStr = ctx.get("duracion");
    const reason = ctx.get("razon") ?? "Sin razón";
    const duration = parseDuration(durStr);

    if (!duration)
      return ctx.send({ content: "Duración inválida. Usa: `30s`, `10m`, `2h`, `1d`", flags: MessageFlags.Ephemeral });

    if (duration > 28 * 86_400_000)
      return ctx.send({ content: "La duración máxima de timeout es 28 días", flags: MessageFlags.Ephemeral });

    if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return ctx.send({ content: "No tienes el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers))
      return ctx.send({ content: "No tengo permiso para silenciar", flags: MessageFlags.Ephemeral });

    if (member.id === ctx.guild.ownerId)
      return ctx.send({ content: "No puedo silenciar al dueño del servidor", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.guild.members.me.roles.highest.position)
      return ctx.send({ content: "No puedo silenciar a alguien con igual o mayor rango que el mío", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.member.roles.highest.position)
      return ctx.send({ content: "No puedes silenciar a alguien con igual o mayor rango que el tuyo", flags: MessageFlags.Ephemeral });

    try {
      await member.timeout(duration, `${ctx.user?.tag ?? ctx.author?.tag}: ${reason}`);

      const username = member.user.globalName || member.user.username;
      const tiempo = formatDuration(duration);

      // mensaje simple en el servidor
      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue aislado por **${tiempo}**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      // DM al usuario
      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(GREEN)
            .setDescription(`Fuiste aislado en **${ctx.guild.name}** por **${tiempo}**\n\n**Razón:** ${reason}`)
            .setTimestamp()
        ]
      }).catch(() => {});

      // embed completo para logs
      const unmuteAt = Date.now() + duration;

      const logEmbed = new EmbedBuilder()
        .setTitle("Usuario aislado")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`, inline: true },
          { name: "Duración", value: tiempo, inline: true },
          { name: "Expira", value: `<t:${Math.floor(unmuteAt / 1000)}:R>`, inline: true },
          { name: "Razón", value: reason, inline: false },
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);

    } catch {
      await ctx.send({ content: "No se pudo silenciar al usuario", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── UNMUTE ────────────────────────────────────
 .addCommand({
  data: new CommandBuilder({
    name: "unmute",
    description: "Quita el timeout a un usuario",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario", description: "Usuario a desmutear", required: true })
    .addString({ name: "razon", description: "Razón", required: false }),

  async code(ctx) {
    const member = ctx.get("usuario");
    const reason = ctx.get("razon") ?? "Sin razón";

    if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return ctx.send({ content: "No tienes el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers))
      return ctx.send({ content: "No tengo permiso para quitar timeouts", flags: MessageFlags.Ephemeral });

    if (!member.communicationDisabledUntil)
      return ctx.send({ content: "Ese usuario no está silenciado", flags: MessageFlags.Ephemeral });

    try {
      await member.timeout(null, `${ctx.user?.tag ?? ctx.author?.tag}: ${reason}`);

      const username = member.user.globalName || member.user.username;

      // mensaje simple en el servidor
      const publicEmbed = new EmbedBuilder()
        .setDescription(`El aislamiento de **${username}** fue removido`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      // DM al usuario
      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(GREEN)
            .setDescription(`Tu aislamiento en **${ctx.guild.name}** fue removido`)
            .setTimestamp()
        ]
      }).catch(() => {});

      // embed completo para logs
      const logEmbed = new EmbedBuilder()
        .setTitle("Timeout removido")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`, inline: true },
          { name: "Razón", value: reason, inline: false },
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);

    } catch {
      await ctx.send({ content: "No se pudo quitar el timeout", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── PURGE ─────────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "purge",
    description: "Elimina mensajes del canal",
  }),
  params: new ParamsBuilder()
    .addString({ name: "cantidad", description: "Mensajes a borrar (1-100)", required: true })
    .addMember({ name: "usuario", description: "Filtrar por usuario (opcional)", required: false }),

  async code(ctx) {
    const amountRaw = ctx.get("cantidad");
    const amount = Math.min(100, Math.max(1, parseInt(amountRaw) || 0));
    const target = ctx.get("usuario") ?? null;

    if (!amount)
      return ctx.send({ content: "Ingresa un número válido entre 1 y 100", flags: MessageFlags.Ephemeral });

    if (!ctx.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return ctx.send({ content: "No tienes el permiso `ManageMessages`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages))
      return ctx.send({ content: "No tengo permiso para eliminar mensajes", flags: MessageFlags.Ephemeral });

    try {
      const fetched = await ctx.channel.messages.fetch({ limit: 100 });
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

      let toDelete = fetched
        .filter(m => m.createdTimestamp > twoWeeksAgo)
        .filter(m => !target || m.author.id === target.id)
        .first(amount);

      if (!toDelete.length)
        return ctx.send({ content: "No hay mensajes recientes para borrar", flags: MessageFlags.Ephemeral });

      const deleted = await ctx.channel.bulkDelete(toDelete, true);

      const cantidad = deleted.size;
      const verbo = cantidad === 1 ? "Se eliminó" : "Se eliminaron";
      const palabra = cantidad === 1 ? "mensaje" : "mensajes";

      const username = target
        ? (target.user.globalName || target.user.username)
        : null;

      const texto = target
        ? `${verbo} **${cantidad}** ${palabra} de **${username}**`
        : `${verbo} **${cantidad}** ${palabra}`;

      // embed público
      const embed = new EmbedBuilder()
        .setDescription(texto)
        .setColor(GREEN)
        .setTimestamp();

      const reply = await ctx.send({ embeds: [embed] });

      // embed de logs
      const logEmbed = new EmbedBuilder()
        .setTitle("Purge ejecutado")
        .setColor(GREEN)
        .addFields(
          { name: "Canal", value: `${ctx.channel}`, inline: true },
          { name: "Mensajes eliminados", value: `${cantidad}`, inline: true },
          { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`, inline: true },
          {
            name: "Filtro de usuario",
            value: target ? `${target.user.tag} (\`${target.id}\`)` : "Ninguno",
            inline: false
          }
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);

      setTimeout(() => reply.delete().catch(() => {}), 5000);

    } catch {
      await ctx.send({ content: "No puedo eliminar mensajes antiguos", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── WARN ──────────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "warn",
    description: "Advierte a un usuario",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario", description: "Usuario a advertir", required: true })
    .addString({ name: "razon", description: "Razón", required: true }),

  async code(ctx) {
    const member = ctx.get("usuario");
    const reason = ctx.get("razon");

    if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return ctx.send({ content: "No tienes el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral });

    if (member.user.bot)
      return ctx.send({ content: "No puedes advertir a un bot", flags: MessageFlags.Ephemeral });

    if (member.roles.highest.position >= ctx.member.roles.highest.position)
      return ctx.send({ content: "No puedes advertir a alguien con igual o mayor rango que el tuyo", flags: MessageFlags.Ephemeral });

    try {
      const warnId = generateId();

      await Warn.create({
        guildId: ctx.guild.id,
        userId: member.id,
        moderator: ctx.user?.id ?? ctx.author?.id,
        reason,
        warnId,
      });

      const total = await Warn.countDocuments({ guildId: ctx.guild.id, userId: member.id });

      const username = member.user.globalName || member.user.username;

      // mensaje limpio en el servidor
      const publicEmbed = new EmbedBuilder()
        .setDescription(`**${username}** fue advertido`)
        .setColor(YELLOW)
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      // embed completo para logs
      const logEmbed = new EmbedBuilder()
        .setTitle("Advertencia emitida")
        .setColor(GREEN)
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
          { name: "Moderador", value: `${ctx.user?.tag ?? ctx.author?.tag}`, inline: true },
          { name: "ID", value: `\`${warnId}\``, inline: true },
          { name: "Total warns", value: `${total}`, inline: true },
          { name: "Razón", value: reason, inline: false },
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);

      // DM al usuario
      await member.user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Has recibido una advertencia en ${ctx.guild.name}`)
            .setColor(GREEN)
            .addFields(
              { name: "Razón", value: reason },
              { name: "Total warns", value: `${total}`, inline: true },
              { name: "ID", value: `\`${warnId}\``, inline: true },
            )
            .setTimestamp(),
        ],
      }).catch(() => {});

    } catch {
      await ctx.send({ content: "No se pudo registrar la advertencia", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── REMOVEWARN ────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "removewarn",
    description: "Elimina una advertencia con su ID",
  }),
  params: new ParamsBuilder()
    .addString({ name: "id", description: "ID de la advertencia", required: true }),

  async code(ctx) {
    const warnId = ctx.get("id").toUpperCase();

    if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return ctx.send({ content: "No tienes el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral });

    try {
      const warn = await Warn.findOneAndDelete({ guildId: ctx.guild.id, warnId });
      if (!warn)
        return ctx.send({ content: `No encontré la advertencia con ID \`${warnId}\``, flags: MessageFlags.Ephemeral });

      const user = await ctx.guild.client.users.fetch(warn.userId).catch(() => null);
      const username = user?.globalName || user?.username || warn.userId;

      const embed = new EmbedBuilder()
        .setDescription(`Se eliminó la advertencia **${warnId}** a **${username}**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
      await sendLog(ctx.guild, embed);

    } catch {
      await ctx.send({ content: "No se pudo eliminar la advertencia", flags: MessageFlags.Ephemeral });
    }
  },
})

// ── CLEARWARNS ────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "clearwarns",
    description: "Borra todas las advertencias de un usuario",
  }),
  params: new ParamsBuilder()
    .addMember({ name: "usuario", description: "Usuario", required: true }),

  async code(ctx) {
    const member = ctx.get("usuario");

    if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return ctx.send({ content: "No tienes el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral });

    try {
      const result = await Warn.deleteMany({ guildId: ctx.guild.id, userId: member.id });

      if (!result.deletedCount)
        return ctx.send({ content: `${member.user.tag} no tiene advertencias`, flags: MessageFlags.Ephemeral });

      const count = result.deletedCount;
      const plural = count > 1 ? "advertencias" : "advertencia";
      const username = member.user.globalName || member.user.username;

      const embed = new EmbedBuilder()
        .setDescription(`Se eliminó **${count}** ${plural} de **${username}**`)
        .setColor(GREEN)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
      await sendLog(ctx.guild, embed);

    } catch {
      await ctx.send({ content: "No se pudieron limpiar las advertencias", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── WARNINGS ──────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "warnings",
      description: "Ver advertencias de un usuario",
    }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario", required: true }),

    async code(ctx) {
      const member = ctx.get("usuario");

      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send({ content: "No tienes el permiso `ModerateMembers`", flags: MessageFlags.Ephemeral });

      try {
        const warns = await Warn.find({ guildId: ctx.guild.id, userId: member.id }).sort({ createdAt: -1 });

        if (!warns.length)
          return ctx.send({ content: `${member.user.tag} no tiene advertencias`, flags: MessageFlags.Ephemeral });

        const perPage = 5;
        const pages = [];

        for (let i = 0; i < warns.length; i += perPage) {
          pages.push(warns.slice(i, i + perPage));
        }

        let page = 0;
        const authorId = ctx.user?.id ?? ctx.author?.id;
        const prevId = `warns_prev_${Date.now()}`;
        const nextId = `warns_next_${Date.now()}`;

        const buildEmbed = () => {
          const embed = new EmbedBuilder()
            .setTitle(`Advertencias de ${member.user.tag} (${page + 1}/${pages.length})`)
            .setColor(YELLOW)
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: `${warns.length} advertencias en total` })

          pages[page].forEach(w => {
            embed.addFields({
              name: `\`${w.warnId}\` — <t:${Math.floor(w.createdAt.getTime() / 1000)}:d>`,
              value: `> **Razón:** ${w.reason}\n> **Mod:** <@${w.moderator}>`,
            });
          });

          return embed;
        };

        const msg = await ctx.send({
          embeds: [buildEmbed()],
          components: pages.length > 1 ? [buildPagRow(prevId, nextId, page, pages.length)] : [],
        });

        if (pages.length <= 1) return;

        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60 * 1000,
          filter: i => [prevId, nextId].includes(i.customId),
        });

        collector.on("collect", async i => {
          if (i.user.id !== authorId) return i.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
          if (i.customId === prevId) page--;
          if (i.customId === nextId) page++;
          await i.update({ embeds: [buildEmbed()], components: [buildPagRow(prevId, nextId, page, pages.length)] });
        });

        collector.on("end", async () => {
          await msg.edit({ components: [] }).catch(() => {});
        });
      } catch {
        await ctx.send({ content: "No se pudieron obtener las advertencias", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── SETLOGS ───────────────────────────────────
  .addCommand({
  data: new CommandBuilder({
    name: "setlogs",
    description: "Establece el canal de logs para RedBot en el servidor",
  }),
  params: new ParamsBuilder()
    .addChannel({
      name: "canal",
      description: "Canal de texto para los logs de RedBot",
      required: true,
    }),

  async code(ctx) {
    if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return ctx.send({ content: "No tienes el permiso `ManageGuild`", flags: MessageFlags.Ephemeral });

    const channel = ctx.get("canal");

    if (!channel.isTextBased())
      return ctx.send({ content: "El canal debe ser de texto", flags: MessageFlags.Ephemeral });

    try {
      await Log.findOneAndUpdate(
        { guildId: ctx.guild.id },
        { channelId: channel.id },
        { upsert: true, new: true }
      );

      const embed = new EmbedBuilder()
        .setTitle("Canal de logs establecido")
        .setColor(GREEN)
        .setDescription(`Los logs se enviarán a \n${channel}`)
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    } catch {
      await ctx.send({ content: "No se establecer el canal de logs", flags: MessageFlags.Ephemeral });
    }
  },
})

  // ── REMOVELOGS ────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "removelogs",
      description: "Desactiva los logs de Redbot en el servidor",
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return ctx.send({ content: "No tienes el permiso `ManageGuild`", flags: MessageFlags.Ephemeral });

      try {
        const result = await Log.findOneAndDelete({ guildId: ctx.guild.id });

        if (!result)
          return ctx.send({ content: "No hay un canal de logs configurado", flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
          .setColor(RED)
        .setTitle("Canal de logs removido")
          .setDescription(`Ya no se enviará nada`)
          .setTimestamp();

        await ctx.send({ embeds: [embed] });
      } catch {
        await ctx.send({ content: "No se pudo configurar los logs", flags: MessageFlags.Ephemeral });
      }
    },
  }),
};

module.exports = { data };
