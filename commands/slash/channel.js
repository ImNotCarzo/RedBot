const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, MessageFlags, ChannelType } = require("discord.js");
const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { RED, GREEN } = require("../../src/config");
const { sendLog } = require("../../src/guild");
const { Logger, noGuildReply, uniqueId, handleCommandError, failWith } = require("../../src/runtime");

const log = new Logger("CMD_CHANNEL", process.env.LOG_LEVEL);

const MANAGE_CHANNELS_PLUGINS = [Plugins.hasPerms("ManageChannels"), Plugins.hasBotPerms("ManageChannels")];

function formatSlowmode(seconds) {
  if (seconds === 0) return "desactivado";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function parseSlowmode(str) {
  if (typeof str !== "string") str = String(str ?? "");
  const match = str.trim().match(/^(\d+)(s|m|h)?$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600 };
  const seconds = value * multipliers[unit];
  if (seconds > 21600) return null;
  return seconds;
}

const CHANNEL_TYPES = {
  [ChannelType.GuildText]: "Texto",
  [ChannelType.GuildVoice]: "Voz",
  [ChannelType.GuildCategory]: "Categoría",
  [ChannelType.GuildAnnouncement]: "Anuncios",
  [ChannelType.GuildForum]: "Foro",
  [ChannelType.GuildStageVoice]: "Escenario",
  [ChannelType.GuildDirectory]: "Directorio",
  [ChannelType.GuildMedia]: "Media",
};

function createEveryoneOverwriteCommand({ name, description, paramDesc, overwrite, publicText, color, logTitle, errorMsg }) {
  return {
    data: new CommandBuilder({ name, description }),
    params: new ParamsBuilder().addChannel({ name: "canal", description: paramDesc, required: false }),
    plugins: MANAGE_CHANNELS_PLUGINS,
    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      try {
        await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, overwrite, {
          reason: `${modTag}: channel ${name}`,
        });

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setDescription(publicText(channel))
              .setColor(color)
              .setTimestamp(),
          ],
        });

        await sendLog(
          ctx.guild,
          new EmbedBuilder()
            .setTitle(logTitle)
            .setColor(color)
            .addFields(
              { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
              { name: "Moderador", value: modTag, inline: true },
            )
            .setTimestamp()
        );
      } catch (err) {
        return failWith(ctx, err, errorMsg);
      }
    },
  };
}

function createMemberAccessCommand({ name, description, allow, publicText, color, logTitle, errorMsg }) {
  return {
    data: new CommandBuilder({ name, description }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario", required: true })
      .addChannel({ name: "canal", description: "Canal objetivo (opcional, por defecto el actual)", required: false }),
    plugins: MANAGE_CHANNELS_PLUGINS,
    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);
      const member = ctx.get("usuario");
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      try {
        await channel.permissionOverwrites.edit(member, {
          ViewChannel: allow,
        }, { reason: `${modTag}: channel ${name}` });

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setDescription(publicText(member, channel))
              .setColor(color)
              .setTimestamp(),
          ],
        });

        await sendLog(
          ctx.guild,
          new EmbedBuilder()
            .setTitle(logTitle)
            .setColor(color)
            .addFields(
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
              { name: "Moderador", value: modTag, inline: true },
            )
            .setTimestamp()
        );
      } catch (err) {
        return failWith(ctx, err, errorMsg);
      }
    },
  };
}

const data = {
  data: new GroupBuilder({
    name: "channel",
    description: "Comandos de gestión de canales",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({
        name: "info",
        description: "Muestra información de un canal",
      }),
      params: new ParamsBuilder().addChannel({
        name: "canal",
        description: "Canal a inspeccionar (opcional, por defecto el actual)",
        required: false,
      }),
      async code(ctx) {
        try {
          const channel = ctx.get("canal") ?? ctx.channel;
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);
          if (!channel) return ctx.send("No se pudo obtener el canal");

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
          log.error("Error en channel info", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "rename",
        description: "Renombra un canal",
      }),
      params: new ParamsBuilder()
        .addChannel({ name: "canal", description: "Canal a renombrar", required: true })
        .addString({ name: "nombre", description: "Nombre nuevo", required: true }),
      plugins: MANAGE_CHANNELS_PLUGINS,
      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);
        const channel = ctx.get("canal");
        const rawName = ctx.get("nombre");
        const isTextLike = channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
        const newName = (isTextLike ? rawName.toLowerCase().replace(/\s+/g, "-") : rawName).trim().slice(0, 100);
        const modTag = ctx.user?.tag ?? ctx.author?.tag;

        try {
          const oldName = channel.name;
          await channel.setName(newName, `${modTag}: channel rename`);

          await ctx.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("Canal renombrado")
                .setColor(GREEN)
                .addFields(
                  { name: "Antes", value: `\`${oldName}\``, inline: true },
                  { name: "Ahora", value: `\`${newName}\``, inline: true },
                )
                .setTimestamp(),
            ],
          });

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Canal renombrado")
              .setColor(GREEN)
              .addFields(
                { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
                { name: "Moderador", value: modTag, inline: true },
                { name: "Antes", value: `\`${oldName}\``, inline: true },
                { name: "Ahora", value: `\`${newName}\``, inline: true },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo renombrar el canal");
        }
      },
    })
    .addCommand(
      createEveryoneOverwriteCommand({
        name: "lock",
        description: "Bloquea un canal para usuarios normales",
        paramDesc: "Canal a bloquear (opcional, por defecto el actual)",
        overwrite: { SendMessages: false },
        publicText: (channel) => `**${channel} fue cerrado**`,
        color: RED,
        logTitle: "Canal bloqueado",
        errorMsg: "No se pudo bloquear el canal",
      })
    )
    .addCommand(
      createEveryoneOverwriteCommand({
        name: "unlock",
        description: "Abre un canal bloqueado",
        paramDesc: "Canal a abrir (opcional, por defecto el actual)",
        overwrite: { SendMessages: null },
        publicText: (channel) => `**${channel} fue abierto**`,
        color: GREEN,
        logTitle: "Canal desbloqueado",
        errorMsg: "No se pudo desbloquear el canal",
      })
    )
    .addCommand({
      data: new CommandBuilder({
        name: "slowmode",
        description: "Establece el slowmode de un canal (0 para desactivar, máx 6h)",
      }),
      params: new ParamsBuilder()
        .addString({ name: "tiempo", description: "Tiempo (ej: 5s, 10m, 1h, 0 para desactivar)", required: true })
        .addChannel({ name: "canal", description: "Canal objetivo (opcional, por defecto el actual)", required: false }),
      plugins: MANAGE_CHANNELS_PLUGINS,
      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);
        const channel = ctx.get("canal") ?? ctx.channel;
        const modTag = ctx.user?.tag ?? ctx.author?.tag;
        const seconds = parseSlowmode(ctx.get("tiempo"));

        if (seconds === null) {
          return ctx.send({
            content: "Tiempo inválido. Usa `5s`, `10m`, `1h` o `0` para desactivar. Máximo 6h.",
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await channel.setRateLimitPerUser(seconds, `${modTag}: channel slowmode`);
          const formatted = formatSlowmode(seconds);
          const color = seconds === 0 ? GREEN : RED;

          await ctx.send({
            embeds: [
              new EmbedBuilder()
                .setDescription(
                  seconds === 0
                    ? `El slowmode en ${channel} fue desactivado`
                    : `El slowmode de ${channel} se estableció en **${formatted}**`
                )
                .setColor(color)
                .setTimestamp(),
            ],
          });

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Slowmode actualizado")
              .setColor(color)
              .addFields(
                { name: "Canal", value: `${channel} (\`${channel.id}\`)`, inline: true },
                { name: "Moderador", value: modTag, inline: true },
                { name: "Slowmode", value: formatted, inline: true },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo cambiar el slowmode");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "nuke",
        description: "Recrea el canal borrando todos sus mensajes",
      }),
      params: new ParamsBuilder().addChannel({
        name: "canal",
        description: "Canal a nukear (opcional, por defecto el actual)",
        required: false,
      }),
      plugins: [Plugins.hasPerms("Administrator"), Plugins.hasBotPerms("ManageChannels")],
      async code(ctx) {
        const channel = ctx.get("canal") ?? ctx.channel;
        const guild = ctx.guild;
        const modTag = ctx.user?.tag ?? ctx.author?.tag;
        const authorId = ctx.user?.id ?? ctx.author?.id;

        if (!guild) return noGuildReply(ctx);
        if (!channel) {
          return ctx.send({ content: "No se pudo obtener el canal", flags: MessageFlags.Ephemeral });
        }

        const confirmId = uniqueId("nuke_confirm");
        const cancelId = uniqueId("nuke_cancel");

        const confirmEmbed = new EmbedBuilder()
          .setTitle("¿Estás seguro?")
          .setDescription("Al confirmar esta acción, el canal será **borrado** y posteriormente clonado con los mismos permisos")
          .setColor(RED)
          .setFooter({ text: "Todos los mensajes se borrarán" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(confirmId).setLabel("Confirmar").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(cancelId).setLabel("Cancelar").setStyle(ButtonStyle.Secondary)
        );

        const msg = await ctx.send({ embeds: [confirmEmbed], components: [row] });

        const collector = msg.createMessageComponentCollector({
          time: 5 * 60 * 1000,
          filter: (i) => [confirmId, cancelId].includes(i.customId),
        });

        collector.on("collect", async (interaction) => {
          if (interaction.user.id !== authorId) {
            return interaction.reply({ content: "No puedes usar estos botones", flags: MessageFlags.Ephemeral });
          }

          if (interaction.customId === cancelId) {
            collector.stop();
            return interaction.update({
              embeds: [new EmbedBuilder().setDescription("Nuke cancelado").setColor(RED)],
              components: [],
            }).catch(() => {});
          }

          if (interaction.customId === confirmId) {
            collector.stop();

            let newChannel;
            try {
              const position = channel.position;
              newChannel = await channel.clone({ reason: `${modTag}: channel nuke` });
              await newChannel.setPosition(position).catch(() => {});
              await channel.delete(`${modTag}: channel nuke`);

              await newChannel.send({
                embeds: [new EmbedBuilder().setDescription("Canal nukeado").setColor(RED)],
              }).catch(() => {});

              await sendLog(
                guild,
                new EmbedBuilder()
                  .setTitle("Canal nukeado")
                  .setColor(RED)
                  .addFields(
                    { name: "Canal", value: `\`#${newChannel.name}\``, inline: true },
                    { name: "Nuevo ID", value: `\`${newChannel.id}\``, inline: true },
                    { name: "Moderador", value: modTag, inline: true }
                  )
                  .setTimestamp()
              ).catch(() => {});

              await interaction.update({
                embeds: [new EmbedBuilder().setDescription("Canal nukeado correctamente").setColor(RED)],
                components: [],
              }).catch(() => {});
            } catch (err) {
              log.error("Error en nuke", { err: err?.message ?? String(err) });
              if (newChannel && !channel.deleted) {
                await newChannel.delete("Rollback: channel nuke failed").catch(() => {});
              }

              await interaction.update({
                embeds: [new EmbedBuilder().setDescription("No se pudo nukear el canal").setColor(RED).setTimestamp()],
                components: [],
              }).catch(() => {});
            }
          }
        });

        collector.on("end", async () => {
          await msg.edit({ components: [] }).catch(() => {});
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "clone",
        description: "Clona un canal con su configuración",
      }),
      params: new ParamsBuilder().addChannel({
        name: "canal",
        description: "Canal a clonar (opcional, por defecto el actual)",
        required: false,
      }),
      plugins: MANAGE_CHANNELS_PLUGINS,
      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);
        const channel = ctx.get("canal") ?? ctx.channel;
        const modTag = ctx.user?.tag ?? ctx.author?.tag;

        try {
          const cloned = await channel.clone({ reason: `${modTag}: channel clone` });

          await ctx.send({
            embeds: [
              new EmbedBuilder()
                .setDescription(`${channel} fue clonado → ${cloned}`)
                .setColor(GREEN)
                .setTimestamp(),
            ],
          });

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Canal clonado")
              .setColor(GREEN)
              .addFields(
                { name: "Original", value: `${channel} (\`${channel.id}\`)`, inline: true },
                { name: "Clon", value: `${cloned} (\`${cloned.id}\`)`, inline: true },
                { name: "Moderador", value: modTag, inline: true },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo clonar el canal");
        }
      },
    })
    .addCommand(
      createMemberAccessCommand({
        name: "permit",
        description: "Da acceso a un usuario en un canal",
        allow: true,
        publicText: (member, channel) => `${member} ahora tiene acceso a ${channel}`,
        color: GREEN,
        logTitle: "Acceso concedido",
        errorMsg: "No se pudo dar acceso al usuario",
      })
    )
    .addCommand(
      createMemberAccessCommand({
        name: "deny",
        description: "Quita el acceso a un usuario en un canal",
        allow: false,
        publicText: (member, channel) => `${member} ya no tiene acceso a ${channel}`,
        color: RED,
        logTitle: "Acceso denegado",
        errorMsg: "No se pudo quitar el acceso al usuario",
      })
    )
    .addCommand(
      createEveryoneOverwriteCommand({
        name: "hide",
        description: "Oculta un canal a @everyone",
        paramDesc: "Canal a ocultar (opcional, por defecto el actual)",
        overwrite: { ViewChannel: false },
        publicText: (channel) => `${channel} fue ocultado`,
        color: RED,
        logTitle: "Canal ocultado",
        errorMsg: "No se pudo ocultar el canal",
      })
    ),
};

module.exports = { data };
