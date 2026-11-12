const { EmbedBuilder, ChannelType } = require("discord.js");
const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins, ComponentsV2Builder, V2Text, V2View } = require("gralonium");
const { RED, GREEN } = require("../../src/config");
const { sendLog } = require("../../src/guild");
const { Logger, THINKING_TEXT, noGuildReply, handleCommandError, buildActionCard, avatarUrl, failWith } = require("../../src/runtime");
const { getMessageText } = require("../../src/adapter");
const { generateText } = require("../../src/ai");

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
      await ctx.defer();
      if (!ctx.guild) return noGuildReply(ctx);
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag;

      try {
        await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, overwrite, {
          reason: `${modTag}: channel ${name}`,
        });

        await ctx.send(
          buildActionCard({
            title: logTitle,
            fields: [
              ["Canal", `${channel}`],
              ["Detalle", publicText(channel)],
            ],
            moderator: modTag,
            color,
          })
        );

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
      await ctx.defer();
      if (!ctx.guild) return noGuildReply(ctx);
      const member = ctx.get("usuario");
      const channel = ctx.get("canal") ?? ctx.channel;
      const modTag = ctx.user?.tag;

      try {
        await channel.permissionOverwrites.edit(member, {
          ViewChannel: allow,
        }, { reason: `${modTag}: channel ${name}` });

        await ctx.send(
          buildActionCard({
            title: logTitle,
            thumbnail: avatarUrl(member.user),
            fields: [
              ["Usuario", `${member}`],
              ["Canal", `${channel}`],
              ["Detalle", publicText(member, channel)],
            ],
            moderator: modTag,
            color,
          })
        );

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
          const generalRows = [
            ["ID", V2Text.code(channel.id)],
            channel.topic ? ["Tema", V2Text.clip(channel.topic, 1024)] : null,
            ["Posición", V2Text.code(channel.position ?? "No disponible")],
            ["Creación", `<t:${createdTs}:F> (<t:${createdTs}:R>)`],
          ];
          const configRows = [
            ["Tipo", V2Text.code(type)],
            ["Slowmode", V2Text.code(formatSlowmode(channel.rateLimitPerUser ?? 0))],
            ["NSFW", V2Text.code(channel.nsfw ? "Sí" : "No")],
          ];

          const infoCard = new ComponentsV2Builder({ color: RED })
            .addSection(
              [
                V2Text.heading(`#${V2Text.clip(channel.name, 100)}`, 3),
                V2Text.sectionBlock("General", generalRows),
              ],
              { thumbnail: guild?.iconURL({ size: 1024, extension: "png" }) }
            )
            .addSectionBlock("Configuración", configRows, { separator: true });

          await ctx.send(infoCard);
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
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);
        const channel = ctx.get("canal");
        const rawName = ctx.get("nombre");
        const isTextLike = channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
        const newName = (isTextLike ? rawName.toLowerCase().replace(/\s+/g, "-") : rawName).trim().slice(0, 100);
        const modTag = ctx.user?.tag;

        try {
          const oldName = channel.name;
          await channel.setName(newName, `${modTag}: channel rename`);

          await ctx.send(
            buildActionCard({
              title: "Canal renombrado",
              fields: [
                ["Canal", `${channel}`],
                ["Antes", V2Text.code(oldName)],
                ["Ahora", V2Text.code(newName)],
              ],
              moderator: modTag,
              color: GREEN,
            })
          );

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
        publicText: (channel) => `${channel} fue cerrado`,
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
        publicText: (channel) => `${channel} fue abierto`,
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
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);
        const channel = ctx.get("canal") ?? ctx.channel;
        const modTag = ctx.user?.tag;
        const seconds = parseSlowmode(ctx.get("tiempo"));

        if (seconds === null) {
          return ctx.ephemeral("Tiempo inválido. Usa `5s`, `10m`, `1h` o `0` para desactivar. Máximo 6h.");
        }

        try {
          await channel.setRateLimitPerUser(seconds, `${modTag}: channel slowmode`);
          const formatted = formatSlowmode(seconds);
          const color = seconds === 0 ? GREEN : RED;

          await ctx.send(
            buildActionCard({
              title: seconds === 0 ? "Slowmode desactivado" : "Slowmode establecido",
              fields: [
                ["Canal", `${channel}`],
                ["Slowmode", V2Text.code(formatted)],
              ],
              moderator: modTag,
              color,
            })
          );

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
        const modTag = ctx.user?.tag;
        const authorId = ctx.user?.id;

        if (!guild) return noGuildReply(ctx);
        if (!channel) return ctx.ephemeral("No se pudo obtener el canal");
        await ctx.defer();

        const nukeView = new V2View({
          authorId,
          timeout: 5 * 60 * 1000,
          thirdPartyMode: "reject",
          thirdPartyMessage: "No puedes usar estos botones",
          onEnd: "static",
          state: { status: "pending" },
          render: ({ view }) =>
            ComponentsV2Builder.confirm({
              title: "¿Estás seguro?",
              message: "Al confirmar esta acción, el canal será **borrado** y posteriormente clonado con los mismos permisos",
              warning: "Todos los mensajes se borrarán",
              confirmId: view.id("confirm"),
              cancelId: view.id("cancel"),
              confirmLabel: "Confirmar",
              cancelLabel: "Cancelar",
              cancelStyle: "secondary",
              color: RED,
            }),
          renderStatic: ({ state }) => {
            const msg = state.status === "cancelled" ? "Nuke cancelado" : "Confirmación expirada";
            return ComponentsV2Builder.card({ description: msg, color: RED });
          },
          actions: {
            cancel: ({ setState, view }) => {
              setState({ status: "cancelled" });
              view.stop("cancelled");
              return false;
            },
            confirm: async ({ interaction, setState, view }) => {
              setState({ status: "done" });
              view.stop("confirmed");

              let newChannel;
              try {
                const position = channel.position;
                newChannel = await channel.clone({ reason: `${modTag}: channel nuke` });
                await newChannel.setPosition(position).catch(() => {});
                await channel.delete(`${modTag}: channel nuke`);

                await newChannel
                  .send(
                    buildActionCard({
                      title: "Canal nukeado",
                      fields: [["Canal", `${newChannel}`]],
                      moderator: modTag,
                      color: RED,
                    }).toPayload()
                  )
                  .catch(() => {});

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

                await interaction
                  .update(ComponentsV2Builder.card({ description: "Canal nukeado correctamente", color: RED }).toPayload())
                  .catch(() => {});
              } catch (err) {
                log.error("Error en nuke", { err: err?.message ?? String(err) });
                if (newChannel && !channel.deleted) {
                  await newChannel.delete("Rollback: channel nuke failed").catch(() => {});
                }

                await interaction
                  .update(ComponentsV2Builder.card({ description: "No se pudo nukear el canal", color: RED }).toPayload())
                  .catch(() => {});
              }
              return false;
            },
          },
        });

        await nukeView.send(ctx);
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
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);
        const channel = ctx.get("canal") ?? ctx.channel;
        const modTag = ctx.user?.tag;

        try {
          const cloned = await channel.clone({ reason: `${modTag}: channel clone` });

          await ctx.send(
            buildActionCard({
              title: "Canal clonado",
              fields: [
                ["Original", `${channel}`],
                ["Clon", `${cloned}`],
              ],
              moderator: modTag,
              color: GREEN,
            })
          );

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

const recapCommand = {
  data: new CommandBuilder({
    name: "recap",
    description: "Resume los últimos mensajes del canal",
  }),
  params: new ParamsBuilder().addString({
    name: "cantidad",
    description: "Mensajes a resumir (10-100, por defecto 50)",
    required: false,
  }),
  plugins: [Plugins.hasBotPerms("ViewChannel", "ReadMessageHistory")],
  async code(ctx) {
    if (!ctx.guild) return noGuildReply(ctx);

    await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });

    try {
      const amount = Math.min(100, Math.max(10, Number.parseInt(ctx.get("cantidad"), 10) || 50));
      const fetched = await ctx.channel.messages.fetch({ limit: amount });
      const commandMessageId = ctx.message?.id ?? null;

      const lines = [...fetched.values()]
        .reverse()
        .filter((m) => !m.author.bot && m.id !== commandMessageId)
        .map((m) => {
          const text = (m.cleanContent?.trim() || getMessageText(m)).replace(/\s+/g, " ").trim();
          return text ? `${m.member?.displayName ?? m.author.username}: ${text.slice(0, 400)}` : null;
        })
        .filter(Boolean);

      if (lines.length < 3) {
        return ctx.ephemeral("No hay suficientes mensajes para resumir");
      }

      const prompt =
        "Resume la siguiente conversación de un canal de Discord. Indica los temas principales y, cuando sea relevante, quién dijo qué. " +
        "Solo el resumen, objetivo, sin opiniones ni frases previas. Responde en español, máximo 3 párrafos.\n\n" +
        lines.join("\n").slice(0, 12000);

      const resumen = await generateText(prompt);

      const card = ComponentsV2Builder.card({
        title: `Resumen de #${ctx.channel.name}`,
        description: resumen ?? "No pude generar un resumen",
        footer: `${lines.length} mensajes analizados`,
        color: RED,
      });

      await ctx.send(card);
    } catch (err) {
      log.error("Error en channel recap", { err: err?.message ?? String(err) });
      if (err?.code === 50013 || err?.code === 50001) {
        return failWith(ctx, err, "No pude leer el historial de este canal");
      }
      return handleCommandError(ctx, err);
    }
  },
};

data.data.addCommand(recapCommand);

module.exports = { data };
