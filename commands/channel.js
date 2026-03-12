const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("erine");
const {
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require("discord.js");
const Log = require("../models/Log");
const sendLog = require("../utils/sendLog");
const { RED, GREEN, BLUE } = require("../utils/colors");

function formatSlowmode(seconds) {
  if (seconds === 0)    return "desactivado";
  if (seconds < 60)     return `${seconds}s`;
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function parseSlowmode(str) {
  const match = str.match(/^(\d+)(s|m|h)?$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit  = match[2] ?? "s";
  const multipliers = { s: 1, m: 60, h: 3600 };
  const seconds = value * multipliers[unit];
  // Discord permite 0 (desactivar) hasta 21600 (6h)
  if (seconds < 0 || seconds > 21600) return null;
  return seconds;
}

const CHANNEL_TYPES = {
  [ChannelType.GuildText]:           "Texto",
  [ChannelType.GuildVoice]:          "Voz",
  [ChannelType.GuildCategory]:       "Categoría",
  [ChannelType.GuildAnnouncement]:   "Anuncios",
  [ChannelType.GuildForum]:          "Foro",
  [ChannelType.GuildStageVoice]:     "Escenario",
  [ChannelType.GuildDirectory]:      "Directorio",
  [ChannelType.GuildMedia]:          "Media",
};

// ─────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────

const data = {
  data: new GroupBuilder({
    name: "channel",
    description: "Comandos de gestión de canales",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })

  // ── INFO ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "info",
      description: "Muestra información de un canal",
    }),
    params: new ParamsBuilder()
      .addChannel({
        name: "canal",
        description: "Canal a inspeccionar (opcional, por defecto el actual)",
        required: false,
      }),

    async code(ctx) {
      const channel = ctx.get("canal") ?? ctx.channel;

      const created = `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`;
      const type    = CHANNEL_TYPES[channel.type] ?? "Desconocido";

      const embed = new EmbedBuilder()
        .setTitle(`#${channel.name}`)
        .setColor(BLUE)
        .addFields(
          { name: "ID",               value: `\`${channel.id}\``,                             inline: true },
          { name: "Tipo",             value: type,                                              inline: true },
          { name: "Posición",         value: `${channel.position ?? "—"}`,                    inline: true },
          { name: "Fecha de creación",value: created,                                           inline: false },
          ...(channel.topic ? [{ name: "Tema", value: channel.topic, inline: false }] : []),
          ...(channel.rateLimitPerUser ? [{ name: "Slowmode", value: formatSlowmode(channel.rateLimitPerUser), inline: true }] : []),
          ...(channel.nsfw !== undefined ? [{ name: "NSFW", value: channel.nsfw ? "Sí" : "No", inline: true }] : []),
        )
        .setTimestamp();

      await ctx.send({ embeds: [embed] });
    },
  })

  // ── RENAME ────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "rename",
      description: "Renombra un canal",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal",  description: "Canal a renombrar", required: true })
      .addString({ name: "nombre", description: "Nombre nuevo",       required: true }),

    async code(ctx) {
      const channel  = ctx.get("canal");
      const newName  = ctx.get("nombre").toLowerCase().replace(/\s+/g, "-").slice(0, 100);
      const modTag   = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tienes el permiso `ManageChannels`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para editar canales", flags: MessageFlags.Ephemeral });

      try {
        const oldName = channel.name;
        await channel.setName(newName, `${modTag}: channel rename`);

        const publicEmbed = new EmbedBuilder()
          .setTitle("Canal renombrado")
          .setColor(GREEN)
          .addFields(
            { name: "Antes",     value: `\`${oldName}\``, inline: true },
            { name: "Ahora",     value: `\`${newName}\``, inline: true },
          )
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal renombrado")
          .setColor(GREEN)
          .addFields(
            { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag,                            inline: true },
            { name: "Antes",     value: `\`${oldName}\``,                 inline: true },
            { name: "Ahora",     value: `\`${newName}\``,                 inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo renombrar el canal", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── LOCK ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "lock",
      description: "Bloquea un canal para usuarios normales",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a bloquear (opcional, por defecto el actual)", required: false }),

    async code(ctx) {
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tienes el permiso `ManageChannels`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para editar canales", flags: MessageFlags.Ephemeral });

      try {
        await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, {
          SendMessages: false,
        }, { reason: `${modTag}: channel lock` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`**${channel} fue cerrado**`)
          .setColor(RED)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal bloqueado")
          .setColor(RED)
          .addFields(
            { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag,                            inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo bloquear el canal", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── UNLOCK ────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "unlock",
      description: "Abre un canal bloqueado",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a abrir (opcional, por defecto el actual)", required: false }),

    async code(ctx) {
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tienes el permiso `ManageChannels`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para editar canales", flags: MessageFlags.Ephemeral });

      try {
        await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, {
          SendMessages: null, // null = volver al default del servidor
        }, { reason: `${modTag}: channel unlock` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`**${channel} fue abierto**`)
          .setColor(GREEN)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal desbloqueado")
          .setColor(GREEN)
          .addFields(
            { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag,                            inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo desbloquear el canal", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── SLOWMODE ──────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "slowmode",
      description: "Establece el slowmode de un canal (0 para desactivar, máx 6h)",
    }),
    params: new ParamsBuilder()
      .addString({ name: "tiempo",  description: "Tiempo (ej: 5s, 10m, 1h, 0 para desactivar)", required: true })
      .addChannel({ name: "canal", description: "Canal objetivo (opcional, por defecto el actual)", required: false }),

    async code(ctx) {
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;
      const seconds = parseSlowmode(ctx.get("tiempo"));

      if (seconds === null)
        return ctx.send({ content: "Tiempo inválido. Usa `5s`, `10m`, `1h` o `0` para desactivar. Máximo 6h.", flags: MessageFlags.Ephemeral });

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tienes el permiso `ManageChannels`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para editar canales", flags: MessageFlags.Ephemeral });

      try {
        await channel.setRateLimitPerUser(seconds, `${modTag}: channel slowmode`);

        const formatted = formatSlowmode(seconds);

        const publicEmbed = new EmbedBuilder()
          .setDescription(
            seconds === 0
              ? `El slowmode en ${channel} fue desactivado`
              : `El slowmode en ${channel} se estableció en **${formatted}**`
          )
          .setColor(BLUE)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Slowmode actualizado")
          .setColor(BLUE)
          .addFields(
            { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag,                            inline: true },
            { name: "Slowmode",  value: formatted,                         inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo cambiar el slowmode", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── NUKE ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "nuke",
      description: "Recrea el canal borrando todos sus mensajes",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a nukear (opcional, por defecto el actual)", required: false }),

    async code(ctx) {
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
        return ctx.send({ content: "No tienes el permiso `Administrator`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para gestionar canales", flags: MessageFlags.Ephemeral });

      try {
        // Guardar datos del canal original
        const parent   = channel.parentId;
        const position = channel.position;
        const name     = channel.name;
        const topic    = channel.topic;
        const nsfw     = channel.nsfw;
        const slowmode = channel.rateLimitPerUser;
        const overwrites = channel.permissionOverwrites.cache;

        // Crear canal nuevo con misma config
        const newChannel = await ctx.guild.channels.create({
          name,
          type:             channel.type,
          topic:            topic ?? undefined,
          nsfw,
          rateLimitPerUser: slowmode,
          parent:           parent ?? undefined,
          permissionOverwrites: overwrites.map(o => ({
            id:    o.id,
            allow: o.allow,
            deny:  o.deny,
          })),
          reason: `${modTag}: channel nuke`,
        });

        // Mover a la posición original
        await newChannel.setPosition(position).catch(() => {});

        // Borrar el canal original
        await channel.delete(`${modTag}: channel nuke`);

        // Anunciar en el nuevo canal
        const nukeEmbed = new EmbedBuilder()
          .setDescription("Canal nukeado, f")
          .setColor(RED)
          .setTimestamp();

        await newChannel.send({ embeds: [nukeEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal nukeado")
          .setColor(RED)
          .addFields(
            { name: "Canal",     value: `\`#${name}\``,                       inline: true },
            { name: "Nuevo ID",  value: `\`${newChannel.id}\``,               inline: true },
            { name: "Moderador", value: modTag,                                inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo nukear el canal", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── CLONE ─────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "clone",
      description: "Clona un canal con su configuración",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a clonar (opcional, por defecto el actual)", required: false }),

    async code(ctx) {
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tienes el permiso `ManageChannels`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para gestionar canales", flags: MessageFlags.Ephemeral });

      try {
        const cloned = await channel.clone({ reason: `${modTag}: channel clone` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${channel} fue clonado → ${cloned}`)
          .setColor(BLUE)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal clonado")
          .setColor(BLUE)
          .addFields(
            { name: "Original",  value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Clon",      value: `${cloned} (\`${cloned.id}\`)`,   inline: true },
            { name: "Moderador", value: modTag,                            inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo clonar el canal", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── PERMIT ────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "permit",
      description: "Da acceso a un usuario en un canal",
    }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario",                                              required: true })
      .addChannel({ name: "canal",  description: "Canal objetivo (opcional, por defecto el actual)",    required: false }),

    async code(ctx) {
      const member  = ctx.get("usuario");
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tienes el permiso `ManageChannels`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para editar canales", flags: MessageFlags.Ephemeral });

      try {
        await channel.permissionOverwrites.edit(member, {
          ViewChannel:  true,
          SendMessages: true,
        }, { reason: `${modTag}: channel permit` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${member} ahora tiene acceso a ${channel}`)
          .setColor(GREEN)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Acceso concedido")
          .setColor(GREEN)
          .addFields(
            { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Canal",     value: `${channel} (\`${channel.id}\`)`,        inline: true },
            { name: "Moderador", value: modTag,                                   inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo dar acceso al usuario", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── DENY ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "deny",
      description: "Quita el acceso a un usuario en un canal",
    }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario",                                              required: true })
      .addChannel({ name: "canal",  description: "Canal objetivo (opcional, por defecto el actual)",    required: false }),

    async code(ctx) {
      const member  = ctx.get("usuario");
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tienes el permiso `ManageChannels`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para editar canales", flags: MessageFlags.Ephemeral });

      try {
        await channel.permissionOverwrites.edit(member, {
          ViewChannel:  false,
          SendMessages: false,
        }, { reason: `${modTag}: channel deny` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${member} ya no tiene acceso a ${channel}`)
          .setColor(RED)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Acceso denegado")
          .setColor(RED)
          .addFields(
            { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Canal",     value: `${channel} (\`${channel.id}\`)`,        inline: true },
            { name: "Moderador", value: modTag,                                   inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo quitar el acceso al usuario", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── HIDE ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "hide",
      description: "Oculta un canal a @everyone",
    }),
    params: new ParamsBuilder()
      .addChannel({ name: "canal", description: "Canal a ocultar (opcional, por defecto el actual)", required: false }),

    async code(ctx) {
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tienes el permiso `ManageChannels`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send({ content: "No tengo permiso para editar canales", flags: MessageFlags.Ephemeral });

      try {
        await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, {
          ViewChannel: false,
        }, { reason: `${modTag}: channel hide` });

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${channel} fue ocultado`)
          .setColor(RED)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal ocultado")
          .setColor(RED)
          .addFields(
            { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag,                            inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch {
        await ctx.send({ content: "No se pudo ocultar el canal", flags: MessageFlags.Ephemeral });
      }
    },
  }),
};

module.exports = { data };