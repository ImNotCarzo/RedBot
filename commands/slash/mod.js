const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins, ComponentsV2Builder, V2Text, V2Paginator } = require("gralonium");
const {
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { buildActionCard, avatarUrl, failWith } = require("../../src/runtime");
const { RED, YELLOW, GREEN } = require("../../src/config");
const {
  generateId,
  parseDuration,
  formatDuration,
  addWarn,
  removeWarnById,
  clearWarnsForUser,
  listWarnsForUser,
  upsertTempBan,
  scheduleTempUnban,
  cancelTempBan,
} = require("../../src/moderation");
const { sendLog, setLogChannel, clearLogChannel } = require("../../src/guild");

function hierarchyChecks(ctx, member, action = "actuar sobre") {
  if (!member?.roles) return "No pude obtener al miembro en el servidor";
  if (member.id === ctx.guild.ownerId) return `No puedo ${action} al dueño del servidor`;
  if (member.id === ctx.guild.members.me?.id) return `No puedo ${action} a mí mismo`;
  if (member.roles.highest.position >= ctx.guild.members.me.roles.highest.position) {
    return `No puedo ${action} alguien con igual o mayor rango que el mío`;
  }
  if (ctx.member.id !== ctx.guild.ownerId && member.roles.highest.position >= ctx.member.roles.highest.position) {
    return `No puedes ${action} alguien con igual o mayor rango que el tuyo`;
  }
  return null;
}

const modTag = (ctx) => ctx.user?.tag;
const userValue = (user, fallbackId = null) => {
  if (!user) return V2Text.code(fallbackId ?? "");
  const name = user.globalName || user.username;
  return `${user} (**${name}**)`;
};

const data = {
  data: new GroupBuilder({
    name: "mod",
    description: "Comandos de moderación",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "ban", description: "Banea a un usuario del servidor" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a banear", required: true })
        .addString({ name: "razon", description: "Razón del ban", required: false })
        .addString({ name: "dias", description: "Días de mensajes a borrar (0-7)", required: false }),
      plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

      async code(ctx) {
        await ctx.defer();

        const member = ctx.get("usuario");
        const reason = ctx.get("razon") ?? "Sin razón";
        const days = Math.min(7, Math.max(0, parseInt(ctx.get("dias")) || 0));
        const tag = modTag(ctx);

        const hierr = hierarchyChecks(ctx, member, "banear a");
        if (hierr) return ctx.ephemeral(hierr);

        try {
          await member.user.send({
            embeds: [new EmbedBuilder().setColor(RED).setDescription(`Fuiste baneado de **${ctx.guild.name}**\nRazón: ${reason}`)],
          }).catch(() => {});

          await member.ban({ deleteMessageSeconds: days * 86400, reason: `${tag}: ${reason}` });
          await cancelTempBan(ctx.guild.id, member.id);

          await ctx.send(
            buildActionCard({
              title: "Usuario baneado",
              thumbnail: avatarUrl(member.user),
              fields: [
                ["Usuario", userValue(member.user)],
                ["Mensajes borrados", V2Text.code(`${days} días`)],
                ["Razón", V2Text.clip(reason, 300, "Sin razón")],
              ],
              moderator: tag,
              color: RED,
            })
          );

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Usuario baneado")
              .setColor(RED)
              .addFields(
                { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "Razón", value: reason, inline: false },
                { name: "Mensajes borrados", value: `${days} días`, inline: true },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No pude banear al usuario");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "unban", description: "Desbanea a un usuario por ID" }),
      params: new ParamsBuilder()
        .addString({ name: "id", description: "ID del usuario", required: true })
        .addString({ name: "razon", description: "Razón del desbaneo", required: false }),
      plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

      async code(ctx) {
        await ctx.defer();
        const userId = ctx.get("id");
        const reason = ctx.get("razon") ?? "Sin razón";
        const tag = modTag(ctx);

        try {
          const ban = await ctx.guild.bans.fetch(userId).catch(() => null);
          if (!ban) return ctx.ephemeral("Ese usuario no está baneado");

          await ban.user.send({
            embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`Fuiste desbaneado de **${ctx.guild.name}**\nRazón: ${reason}`)],
          }).catch(() => {});

          await ctx.guild.members.unban(userId, `${tag}: ${reason}`);
          await cancelTempBan(ctx.guild.id, userId);

          await ctx.send(
            buildActionCard({
              title: "Usuario desbaneado",
              thumbnail: avatarUrl(ban.user),
              fields: [
                ["Usuario", userValue(ban.user, userId)],
                ["Razón", V2Text.clip(reason, 300, "Sin razón")],
              ],
              moderator: tag,
              color: GREEN,
            })
          );

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Usuario desbaneado")
              .setColor(GREEN)
              .addFields(
                { name: "Usuario", value: `${ban.user.tag} (\`${userId}\`)`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "Razón", value: reason, inline: false },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo desbanear al usuario, verifica que el ID sea correcto");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "softban", description: "Banea y desbanea al instante para borrar mensajes recientes" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a softbanear", required: true })
        .addString({ name: "razon", description: "Razón", required: false })
        .addString({ name: "dias", description: "Días de mensajes a borrar (1-7)", required: false }),
      plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

      async code(ctx) {
        await ctx.defer();

        const member = ctx.get("usuario");
        const reason = ctx.get("razon") ?? "Sin razón";
        const days = Math.min(7, Math.max(1, parseInt(ctx.get("dias")) || 7));
        const tag = modTag(ctx);

        const hierr = hierarchyChecks(ctx, member, "softbanear a");
        if (hierr) return ctx.ephemeral(hierr);

        try {
          await member.user.send({
            embeds: [new EmbedBuilder().setColor(RED).setDescription(`Fuiste softbaneado de **${ctx.guild.name}**\nRazón: ${reason}`)],
          }).catch(() => {});

          await member.ban({ deleteMessageSeconds: days * 86400, reason: `[SOFTBAN] ${tag}: ${reason}` });
          await ctx.guild.members.unban(member.id, `[SOFTBAN] ${tag}`);

          await ctx.send(
            buildActionCard({
              title: "Usuario softbaneado",
              thumbnail: avatarUrl(member.user),
              fields: [
                ["Usuario", userValue(member.user)],
                ["Mensajes borrados", V2Text.code(`${days} días`)],
                ["Razón", V2Text.clip(reason, 300, "Sin razón")],
              ],
              moderator: tag,
              color: RED,
            })
          );

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Usuario softbaneado")
              .setColor(RED)
              .addFields(
                { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "Razón", value: reason, inline: false },
                { name: "Mensajes", value: `${days} días borrados`, inline: true },
              )
              .setFooter({ text: "El usuario puede volver a entrar al servidor" })
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No pude softbanear al usuario");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "tempban", description: "Banea a un usuario por un tiempo determinado" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a banear", required: true })
        .addString({ name: "duracion", description: "Duración (ej: 1h, 30m, 2d)", required: true })
        .addString({ name: "razon", description: "Razón", required: false }),
      plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

      async code(ctx) {
        await ctx.defer();

        const member = ctx.get("usuario");
        const durStr = ctx.get("duracion");
        const reason = ctx.get("razon") ?? "Sin razón";
        const duration = parseDuration(durStr);
        const tag = modTag(ctx);

        if (!duration) {
          return ctx.ephemeral("Duración inválida. Usa: `30s`, `10m`, `2h`, `1d`");
        }
        if (duration > 28 * 86_400_000) {
          return ctx.ephemeral("La duración máxima es 28 días");
        }

        const hierr = hierarchyChecks(ctx, member, "banear a");
        if (hierr) return ctx.ephemeral(hierr);

        try {
          const unbanAt = new Date(Date.now() + duration);

          await member.user.send({
            embeds: [new EmbedBuilder().setColor(RED)
              .setDescription(`Fuiste tempbaneado de **${ctx.guild.name}**`)
              .addFields(
                { name: "Razón", value: reason, inline: true },
                { name: "Duración", value: formatDuration(duration), inline: true },
              )],
          }).catch(() => {});

          await member.ban({ reason: `[TEMPBAN ${formatDuration(duration)}] ${tag}: ${reason}` });

          await upsertTempBan({ guildId: ctx.guild.id, userId: member.id, unbanAt });
          scheduleTempUnban(ctx.guild.client, ctx.guild.id, member.id, unbanAt);

          await ctx.send(
            buildActionCard({
              title: "Usuario tempbaneado",
              thumbnail: avatarUrl(member.user),
              fields: [
                ["Usuario", userValue(member.user)],
                ["Duración", V2Text.code(formatDuration(duration))],
                ["Razón", V2Text.clip(reason, 300, "Sin razón")],
              ],
              moderator: tag,
              color: RED,
            })
          );

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Usuario tempbaneado")
              .setColor(RED)
              .addFields(
                { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "Duración", value: formatDuration(duration), inline: true },
                { name: "Expira", value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`, inline: true },
                { name: "Razón", value: reason, inline: false },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No pude hacer el tempban");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "massban", description: "Banea hasta 5 usuarios seleccionados" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario1", description: "Usuario 1", required: true })
        .addMember({ name: "usuario2", description: "Usuario 2", required: false })
        .addMember({ name: "usuario3", description: "Usuario 3", required: false })
        .addMember({ name: "usuario4", description: "Usuario 4", required: false })
        .addMember({ name: "usuario5", description: "Usuario 5", required: false })
        .addString({ name: "razon", description: "Razón", required: false }),
      plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

      async code(ctx) {
        await ctx.defer();

        const users = [1, 2, 3, 4, 5].map((i) => ctx.get(`usuario${i}`)).filter(Boolean);
        const reason = ctx.get("razon") ?? "Sin razón";
        const tag = modTag(ctx);

        if (!users.length) {
          return ctx.ephemeral("Debes seleccionar al menos un usuario");
        }

        const banned = [];
        const failed = [];

        for (const member of users) {
          const hierr = hierarchyChecks(ctx, member, "banear a");
          if (hierr) {
            failed.push(member);
            continue;
          }

          try {
            await member.user.send({
              embeds: [new EmbedBuilder().setColor(RED).setDescription(`Fuiste baneado de **${ctx.guild.name}**\nRazón: ${reason}`)],
            }).catch(() => {});

            await ctx.guild.members.ban(member, { reason: `[MASSBAN] ${tag}: ${reason}` });
            await cancelTempBan(ctx.guild.id, member.id);
            banned.push(member);
          } catch {
            failed.push(member);
          }
        }

        const desc = banned.map((m, i) => `${i + 1}. ${m.user.tag}`).join("\n") || "Ninguno";

        await ctx.send(
          buildActionCard({
            title: "Usuarios baneados",
            fields: [
              ["Baneados", V2Text.code(banned.length)],
              ["Fallidos", V2Text.code(failed.length)],
              ["Razón", V2Text.clip(reason, 300, "Sin razón")],
            ],
            sections: [{ text: `**Detalle**\n${desc}`, separator: true }],
            moderator: tag,
            color: RED,
          })
        );

        const logEmbed = new EmbedBuilder()
          .setTitle("Massban ejecutado")
          .setColor(RED)
          .addFields(
            { name: "Moderador", value: tag, inline: true },
            { name: "Baneados", value: `${banned.length}`, inline: true },
            { name: "Fallidos", value: `${failed.length}`, inline: true },
            { name: "Razón", value: reason, inline: false },
          )
          .setTimestamp();

        if (failed.length) {
          logEmbed.addFields({ name: "No se pudo banear a", value: failed.map((m) => m.user.tag).join(", ") });
        }

        await sendLog(ctx.guild, logEmbed);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "kick", description: "Expulsa a un usuario del servidor" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a expulsar", required: true })
        .addString({ name: "razon", description: "Razón", required: false }),
      plugins: [Plugins.hasPerms("KickMembers"), Plugins.hasBotPerms("KickMembers")],

      async code(ctx) {
        await ctx.defer();

        const member = ctx.get("usuario");
        const reason = ctx.get("razon") ?? "Sin razón";
        const tag = modTag(ctx);

        const hierr = hierarchyChecks(ctx, member, "expulsar a");
        if (hierr) return ctx.ephemeral(hierr);

        try {
          await member.user.send({
            embeds: [new EmbedBuilder().setColor(RED).setDescription(`Fuiste expulsado de **${ctx.guild.name}**\nRazón: ${reason}`)],
          }).catch(() => {});

          await member.kick(`${tag}: ${reason}`);

          await ctx.send(
            buildActionCard({
              title: "Usuario expulsado",
              thumbnail: avatarUrl(member.user),
              fields: [
                ["Usuario", userValue(member.user)],
                ["Razón", V2Text.clip(reason, 300, "Sin razón")],
              ],
              moderator: tag,
              color: RED,
            })
          );

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Usuario expulsado")
              .setColor(RED)
              .addFields(
                { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "Razón", value: reason, inline: false },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo expulsar al usuario");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "mute", description: "Silencia a un usuario con timeout" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a silenciar", required: true })
        .addString({ name: "duracion", description: "Duración (ej: 10m, 1h, 1d)", required: true })
        .addString({ name: "razon", description: "Razón", required: false }),
      plugins: [Plugins.hasPerms("ModerateMembers"), Plugins.hasBotPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();

        const member = ctx.get("usuario");
        const durStr = ctx.get("duracion");
        const reason = ctx.get("razon") ?? "Sin razón";
        const duration = parseDuration(durStr);
        const tag = modTag(ctx);

        if (!duration) {
          return ctx.ephemeral("Duración inválida. Usa: `30s`, `10m`, `2h`, `1d`");
        }
        if (duration > 28 * 86_400_000) {
          return ctx.ephemeral("La duración máxima de timeout es 28 días");
        }

        const hierr = hierarchyChecks(ctx, member, "silenciar a");
        if (hierr) return ctx.ephemeral(hierr);

        try {
          await member.timeout(duration, `${tag}: ${reason}`);

          const tiempo = formatDuration(duration);
          const expireTs = Math.floor((Date.now() + duration) / 1000);

          await ctx.send(
            buildActionCard({
              title: "Usuario silenciado",
              thumbnail: avatarUrl(member.user),
              fields: [
                ["Usuario", userValue(member.user)],
                ["Duración", V2Text.code(tiempo)],
                ["Razón", V2Text.clip(reason, 300, "Sin razón")],
              ],
              moderator: tag,
              color: RED,
            })
          );

          await member.user.send({
            embeds: [new EmbedBuilder().setColor(RED)
              .setDescription(`Fuiste silenciado en **${ctx.guild.name}** por **${tiempo}**`)
              .addFields({ name: "Razón", value: reason })],
          }).catch(() => {});

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Usuario silenciado")
              .setColor(RED)
              .addFields(
                { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "Duración", value: tiempo, inline: true },
                { name: "Expira", value: `<t:${expireTs}:R>`, inline: true },
                { name: "Razón", value: reason, inline: false },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo silenciar al usuario");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "unmute", description: "Quita el timeout a un usuario" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a desmutear", required: true })
        .addString({ name: "razon", description: "Razón", required: false }),
      plugins: [Plugins.hasPerms("ModerateMembers"), Plugins.hasBotPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();

        const member = ctx.get("usuario");
        const reason = ctx.get("razon") ?? "Sin razón";
        const tag = modTag(ctx);
        if (!member.communicationDisabledUntil) {
          return ctx.ephemeral("Ese usuario no está silenciado");
        }

        try {
          await member.timeout(null, `${tag}: ${reason}`);

          await ctx.send(
            buildActionCard({
              title: "Silencio removido",
              thumbnail: avatarUrl(member.user),
              fields: [
                ["Usuario", userValue(member.user)],
                ["Razón", V2Text.clip(reason, 300, "Sin razón")],
              ],
              moderator: tag,
              color: GREEN,
            })
          );

          await member.user.send({
            embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`Tu silencio en **${ctx.guild.name}** fue removido`)],
          }).catch(() => {});

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Silencio removido")
              .setColor(GREEN)
              .addFields(
                { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "Razón", value: reason, inline: false },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo quitar el timeout");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "purge", description: "Elimina mensajes del canal" }),
      params: new ParamsBuilder()
        .addString({ name: "cantidad", description: "Mensajes a borrar (1-100)", required: true })
        .addMember({ name: "usuario", description: "Filtrar por usuario (opcional)", required: false }),
      plugins: [Plugins.hasPerms("ManageMessages"), Plugins.hasBotPerms("ManageMessages")],

      async code(ctx) {
        await ctx.defer();

        const parsedAmount = Number.parseInt(ctx.get("cantidad"), 10);
        const target = ctx.get("usuario") ?? null;
        const tag = modTag(ctx);

        if (!Number.isInteger(parsedAmount) || parsedAmount < 1) {
          return ctx.ephemeral("Ingresa un número válido entre 1 y 100");
        }

        const amount = Math.min(100, parsedAmount);

        try {
          const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
          const fetched = await ctx.channel.messages.fetch({ limit: 100 });
          const cmdMessage = ctx.message ?? null;
          const botReplyId = ctx.interaction?.id ?? null;
          const toDelete = fetched
            .filter((m) =>
              m.id !== cmdMessage?.id &&
              !(botReplyId && (m.interaction?.id === botReplyId || m.interactionMetadata?.id === botReplyId)) &&
              m.createdTimestamp > twoWeeksAgo &&
              (!target || m.author.id === target.id)
            )
            .first(amount);
          if (!toDelete.length) {
            return ctx.ephemeral("No hay mensajes recientes para borrar");
          }

          if (cmdMessage && toDelete.length < 100) toDelete.push(cmdMessage);
          else if (cmdMessage) cmdMessage.delete().catch(() => {});
          const deleted = await ctx.channel.bulkDelete(toDelete, true);
          const cantidad = Math.max(0, deleted.size - (cmdMessage && deleted.has(cmdMessage.id) ? 1 : 0));

          const reply = await ctx.send(
            buildActionCard({
              title: "Mensajes eliminados",
              fields: [
                ["Canal", `${ctx.channel}`],
                ["Cantidad", V2Text.code(cantidad)],
                target ? ["Usuario", userValue(target.user)] : null,
              ].filter(Boolean),
              moderator: tag,
              color: GREEN,
            })
          );

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Purge ejecutado")
              .setColor(GREEN)
              .addFields(
                { name: "Canal", value: `${ctx.channel}`, inline: true },
                { name: "Mensajes eliminados", value: `${cantidad}`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "Filtro", value: target ? `${target.user.tag} (\`${target.id}\`)` : "Ninguno", inline: false },
              )
              .setTimestamp()
          );

          setTimeout(() => reply.delete().catch(() => {}), 5000);
        } catch (err) {
          return failWith(ctx, err, "No pude eliminar los mensajes — pueden ser demasiado antiguos");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "warn", description: "Advierte a un usuario" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a advertir", required: true })
        .addString({ name: "razon", description: "Razón", required: true }),
      plugins: [Plugins.hasPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();
        const member = ctx.get("usuario");
        const reason = ctx.get("razon");
        const tag = modTag(ctx);
        if (member.user.bot) {
          return ctx.ephemeral("No puedes advertir a un bot");
        }
        if (ctx.member.id !== ctx.guild.ownerId && member.roles.highest.position >= ctx.member.roles.highest.position) {
          return ctx.ephemeral("No puedes advertir a alguien con igual o mayor rango que el tuyo");
        }

        try {
          let warnId;
          let total;
          for (let attempt = 0; attempt < 3; attempt++) {
            warnId = generateId();
            try {
              ({ total } = await addWarn({
                guildId: ctx.guild.id,
                userId: member.id,
                moderatorId: ctx.user?.id,
                reason,
                warnId,
              }));
              break;
            } catch (dupErr) {
              if (dupErr?.code === 11000 && attempt < 2) continue;
              throw dupErr;
            }
          }

          await ctx.send(
            buildActionCard({
              title: "Usuario advertido",
              thumbnail: avatarUrl(member.user),
              fields: [
                ["Usuario", userValue(member.user)],
                ["ID de advertencia", V2Text.code(warnId)],
                ["Total", V2Text.code(total)],
                ["Razón", V2Text.clip(reason, 300, "Sin razón")],
              ],
              moderator: tag,
              color: YELLOW,
            })
          );

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Usuario Advertido")
              .setColor(YELLOW)
              .addFields(
                { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                { name: "Moderador", value: tag, inline: true },
                { name: "ID", value: `\`${warnId}\``, inline: true },
                { name: "Total warns", value: `${total}`, inline: true },
                { name: "Razón", value: reason, inline: false },
              )
              .setTimestamp()
          );

          await member.user.send({
            embeds: [new EmbedBuilder()
              .setDescription(`Fuiste advertido en **${ctx.guild.name}**`)
              .setColor(YELLOW)
              .addFields(
                { name: "Razón", value: reason },
                { name: "Total warns", value: `${total}`, inline: true },
                { name: "ID", value: `\`${warnId}\``, inline: true },
              )],
          }).catch(() => {});
        } catch (err) {
          return failWith(ctx, err, "No se pudo registrar la advertencia");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "removewarn", description: "Elimina una advertencia por ID" }),
      params: new ParamsBuilder().addString({ name: "id", description: "ID de la advertencia", required: true }),
      plugins: [Plugins.hasPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();
        const warnId = ctx.get("id").toUpperCase();
        const tag = modTag(ctx);

        try {
          const warn = await removeWarnById({ guildId: ctx.guild.id, warnId });
          if (!warn) {
            return ctx.ephemeral(`No encontré la advertencia con ID \`${warnId}\``);
          }

          const user = await ctx.guild.client.users.fetch(warn.userId).catch(() => null);
          const username = user?.globalName || user?.username || warn.userId;

          await ctx.send(
            buildActionCard({
              title: "Advertencia eliminada",
              thumbnail: avatarUrl(user),
              fields: [
                ["Usuario", userValue(user, warn.userId)],
                ["ID de advertencia", V2Text.code(warnId)],
              ],
              moderator: tag,
              color: GREEN,
            })
          );

          const logEmbed = new EmbedBuilder()
            .setDescription(`Advertencia \`${warnId}\` de **${username}** eliminada`)
            .setColor(GREEN);

          await sendLog(ctx.guild, logEmbed);
        } catch (err) {
          return failWith(ctx, err, "No se pudo eliminar la advertencia");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "clearwarns", description: "Borra todas las advertencias de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Usuario", required: true }),
      plugins: [Plugins.hasPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();
        const member = ctx.get("usuario");
        const tag = modTag(ctx);

        try {
          const deletedCount = await clearWarnsForUser({ guildId: ctx.guild.id, userId: member.id });
          if (!deletedCount) {
            return ctx.ephemeral(`${member.user.tag} no tiene advertencias`);
          }

          const username = member.user.globalName || member.user.username;

          await ctx.send(
            buildActionCard({
              title: "Advertencias eliminadas",
              thumbnail: avatarUrl(member.user),
              fields: [
                ["Usuario", userValue(member.user)],
                ["Cantidad", V2Text.code(deletedCount)],
              ],
              moderator: tag,
              color: GREEN,
            })
          );

          const logEmbed = new EmbedBuilder()
            .setDescription(`Se eliminaron **${deletedCount}** advertencia${deletedCount !== 1 ? "s" : ""} de **${username}**`)
            .setColor(GREEN)
            .setTimestamp();

          await sendLog(ctx.guild, logEmbed);
        } catch (err) {
          return failWith(ctx, err, "No se pudieron limpiar las advertencias");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "warnings", description: "Ver advertencias de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Usuario", required: true }),
      plugins: [Plugins.hasPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();
        const member = ctx.get("usuario");
        const authorId = ctx.user?.id;

        try {
          const warns = await listWarnsForUser({ guildId: ctx.guild.id, userId: member.id });
          if (!warns.length) {
            return ctx.ephemeral(`${member.user.tag} no tiene advertencias`);
          }

          const paginator = new V2Paginator({
            items: warns,
            perPage: 5,
            ownerId: authorId,
            thirdPartyMode: "reject",
            thirdPartyMessage: "No es tu comando",
            wrap: false,
            prevButton: { label: "◀" },
            nextButton: { label: "▶" },
            showPageIndicator: false,
            timeout: 2 * 60 * 1000,
            renderPage: ({ items: pageWarns, pageIndex, totalPages, isEnded, controls }) => {
              const builder = new ComponentsV2Builder({ color: YELLOW }).addSection(
                [
                  V2Text.heading(`Advertencias de ${V2Text.clip(member.user.tag, 100)}`, 3),
                  V2Text.subtext(`Página ${pageIndex + 1}/${totalPages} · ${warns.length} en total`),
                ],
                { thumbnail: member.user.displayAvatarURL({ size: 256 }) }
              );

              for (const w of pageWarns) {
                const ts = Math.floor(w.createdAt.getTime() / 1000);
                const reason = V2Text.clip(w.reason, 500, "Sin razón");
                builder.addSeparator("small").addText(
                  `**\`${w.warnId}\`** — <t:${ts}:d>\n${V2Text.fields([
                    ["Razón", reason],
                    ["Mod", `<@${w.moderator}>`],
                  ])}`
                );
              }

              if (!isEnded && totalPages > 1) {
                builder.addSeparator("small").addButtonsRow(controls);
              }

              return builder;
            },
          });

          await paginator.send(ctx);
        } catch (err) {
          return failWith(ctx, err, "No se pudieron obtener las advertencias");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "setlogs", description: "Establece el canal de logs para RedBot" }),
      params: new ParamsBuilder().addChannel({
        name: "canal",
        description: "Canal de texto para los logs",
        required: true,
        channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      }),
      plugins: [Plugins.hasPerms("ManageGuild")],

      async code(ctx) {
        await ctx.defer();
        const channel = ctx.get("canal");
        const tag = modTag(ctx);
        if (!channel.isTextBased()) {
          return ctx.ephemeral("El canal debe ser de texto");
        }

        try {
          await setLogChannel(ctx.guild.id, channel.id);

          await ctx.send(
            buildActionCard({
              title: "Canal de logs establecido",
              fields: [["Canal", `${channel}`]],
              moderator: tag,
              color: GREEN,
            })
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo establecer el canal de logs");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "removelogs", description: "Desactiva los logs de RedBot en el servidor" }),
      params: new ParamsBuilder(),
      plugins: [Plugins.hasPerms("ManageGuild")],

      async code(ctx) {
        await ctx.defer();
        const tag = modTag(ctx);
        try {
          const removed = await clearLogChannel(ctx.guild.id);
          if (!removed) {
            return ctx.ephemeral("No hay un canal de logs configurado");
          }

          await ctx.send(
            buildActionCard({
              title: "Logs desactivados",
              description: "Ya no se enviarán logs en este servidor",
              moderator: tag,
              color: RED,
            })
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo desactivar los logs");
        }
      },
    }),
};

module.exports = { data };
