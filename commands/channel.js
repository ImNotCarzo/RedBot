const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("erine");
const { RED, GREEN, BLUE } = require("../utils/colors");
const { sendLog } = require("../utils/sendLog");

function noGuildReply(ctx) {
  return ctx.send({
    embeds: [new EmbedBuilder().setDescription("Este comando solo funciona en servidores").setColor(RED)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Invítame").setStyle(ButtonStyle.Link).setURL(INVITE_URL)
    )],
    flags: MessageFlags.Ephemeral,
  });
}

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
    try {
      const channel = ctx.get("canal") ?? ctx.channel;
      const guild = ctx.guild;
      if (!guild) return noGuildReply(ctx);
      if (!channel) {
        return ctx.send("No se pudo obtener el canal");
      }

      const createdTs = Math.floor(channel.createdTimestamp / 1000);
      const type = CHANNEL_TYPES[channel.type] ?? "Desconocido";

      const infoEmbed = new EmbedBuilder()
        .setTitle(`#${channel.name}`)
        .setThumbnail(guild?.iconURL({ size: 1024, extension: "png" }))
        .setColor(RED)
        .addFields(
          {
            name: "General",
            value:
              `> **ID:** \`${channel.id}\`\n` +
              (channel.topic ? `> **Tema:** ${channel.topic}\n` : "") +
              `> **Posición:** \`${channel.position ?? "No disponible"}\`\n` +
              `> **Creación:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
          },
          {
            name: "Configuración",
            value:
              `> **Tipo:** \`${type}\`\n` +
              `> **Slowmode:** \`${formatSlowmode(channel.rateLimitPerUser ?? 0)}\`\n` +
              `> **NSFW:** \`${channel.nsfw ? "Sí" : "No"}\``,
          }
        )
        .setTimestamp();

      await ctx.send({ embeds: [infoEmbed] });
    } catch (err) {
      console.error("Error en channel info:", err);
      await ctx.send("No se pudo obtener la información del canal");
    }
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
      if (!ctx.guild) return noGuildReply(ctx);
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
      if (!ctx.guild) return noGuildReply(ctx);
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
      if (!ctx.guild) return noGuildReply(ctx);
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
      if (!ctx.guild) return noGuildReply(ctx);
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
              : `El slowmode de ${channel} se estableció en **${formatted}**`
          )
          .setColor(RED)

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Slowmode actualizado")
          .setColor(RED)
          .addFields(
            { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
            { name: "Moderador", value: modTag,                            inline: true },
            { name: "Slowmode",  value: formatted,                         inline: true },
          )

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
    .addChannel({
      name: "canal",
      description: "Canal a nukear (opcional, por defecto el actual)",
      required: false,
    }),

  async code(ctx) {
    const channel = ctx.get("canal") ?? ctx.channel;
    const guild = ctx.guild;
    const modTag = ctx.user?.tag ?? ctx.author?.tag;
    const authorId = ctx.user?.id ?? ctx.author?.id;

    if (!guild) return noGuildReply(ctx);
    if (!channel) {
      return ctx.send({ content: "No se pudo obtener el canal", flags: MessageFlags.Ephemeral });
    }

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
      return ctx.send({ content: "No tienes el permiso `Administrator`", flags: MessageFlags.Ephemeral });

    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
      return ctx.send({ content: "No tengo permiso para gestionar canales", flags: MessageFlags.Ephemeral });

    const confirmId = `nuke_confirm_${Date.now()}`;
    const cancelId  = `nuke_cancel_${Date.now()}`;

    const confirmEmbed = new EmbedBuilder()
      .setTitle("¿Estás seguro?")
      .setDescription("Al confirmar esta acción, el canal será **borrado** y posteriormente clonado con los mismos permisos")
      .setColor(RED)
      .setFooter({ text: "Todos los mensajes se borrarán" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel("Confirmar")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel("Cancelar")
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await ctx.send({
      embeds: [confirmEmbed],
      components: [row],
    });

    const collector = msg.createMessageComponentCollector({
  time: 5 * 60 * 1000,
  filter: (i) => [confirmId, cancelId].includes(i.customId),
});

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== authorId) {
        return interaction.reply({
          content: "No puedes usar estos botones",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === cancelId) {
        collector.stop();

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setDescription("Nuke cancelado")
              .setColor(RED),
          ],
          components: [],
        });
      }

      if (interaction.customId === confirmId) {
        collector.stop();

        try {
          const position = channel.position;

          const newChannel = await channel.clone({
            reason: `${modTag}: channel nuke`,
          });

          await newChannel.setPosition(position).catch(() => {});

          await channel.delete(`${modTag}: channel nuke`);

          await newChannel.send({
            embeds: [
              new EmbedBuilder()
                .setDescription("Canal nukeado")
                .setColor(RED),
            ],
          });

          const logEmbed = new EmbedBuilder()
            .setTitle("Canal nukeado")
            .setColor(RED)
            .addFields(
              { name: "Canal", value: `\`#${newChannel.name}\``, inline: true },
              { name: "Nuevo ID", value: `\`${newChannel.id}\``, inline: true },
              { name: "Moderador", value: modTag, inline: true }
            )
            .setTimestamp();

          await sendLog(guild, logEmbed);

          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setDescription("Canal nukeado correctamente")
                .setColor(RED),
            ],
            components: [],
          });

        } catch (err) {
          console.error("Error en nuke:", err);

          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setDescription("No se pudo nukear el canal")
                .setColor(RED)
                .setTimestamp(),
            ],
            components: [],
          });
        }
      }
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
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
      if (!ctx.guild) return noGuildReply(ctx);
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
          .setColor(GREEN)

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Canal clonado")
          .setColor(GREEN)
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
      if (!ctx.guild) return noGuildReply(ctx);
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
      if (!ctx.guild) return noGuildReply(ctx);
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
      if (!ctx.guild) return noGuildReply(ctx);
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
