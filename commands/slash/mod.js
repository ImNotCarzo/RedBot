const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins, ComponentsV2Builder, V2Text, V2View } = require("gralonium");
const {
  AutoModerationActionType,
  AutoModerationRuleTriggerType,
  ChannelSelectMenuBuilder,
  ChannelType,
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  RadioGroupBuilder,
  RadioGroupOptionBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");
const { Logger, buildActionCard, createListPaginator, avatarUrl, failWith, noGuildReply, THINKING_TEXT } = require("../../src/runtime");
const log = new Logger("CMD_MOD", process.env.LOG_LEVEL);
const {
  TRIGGER_QUOTAS,
  TRIGGER_LABELS,
  buildAutoModEditModal,
  buildNativeRuleEditPayload,
  buildNativeRulePayload,
  buildNativeRulePreviewCard,
  compileNaturalLanguageRule,
} = require("../../src/automodAi");
const { RED, YELLOW, GREEN } = require("../../src/config");
const {
  generateId,
  parseDuration,
  formatDuration,
  addModCase,
  addWarn,
  applyWarnEscalation,
  removeWarnById,
  clearWarnsForUser,
  listUnifiedHistoryForUser,
  upsertTempBan,
  scheduleTempUnban,
  cancelTempBan,
} = require("../../src/moderation");

const CASE_TYPE_LABELS = {
  warn: "Warn",
  mute: "Mute",
  auto_mute: "Auto-Mute",
  unmute: "Unmute",
  kick: "Kick",
  ban: "Ban",
  tempban: "Tempban",
  softban: "Softban",
  unban: "Unban",
};
const { GuildConfig } = require("../../src/database");
const { getAutomodConfig, getDramaChannelId, invalidateDramaChannelCache, updateAutomodConfig } = require("../../src/moderationExtra");
const { getLogChannelId, logAction, setLogChannel, clearLogChannel } = require("../../src/guild");

function notifyUser(user, { description, color = RED, fields = null }) {
  const { getCurrentLang, translateEmbed } = require("../../src/i18n");
  const embed = new EmbedBuilder().setColor(color).setDescription(description);
  if (fields?.length) embed.addFields(fields);
  const finalEmbed = getCurrentLang() === "en" ? translateEmbed(embed, "en") : embed;
  return user.send({ embeds: [finalEmbed] }).catch(() => {});
}

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
    description: "Comandos de moderación, sanciones y logs",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "ban", description: "Banea permanentemente a un usuario del servidor" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a banear", required: true })
        .addString({ name: "razon", description: "Motivo de la sanción (opcional)", required: false })
        .addString({ name: "dias", description: "Días de mensajes a eliminar (0-7)", required: false }),
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
          await notifyUser(member.user, {
            description: `Fuiste baneado de **${ctx.guild.name}**\nRazón: ${reason}`,
          });

          await member.ban({ deleteMessageSeconds: days * 86400, reason: `${tag}: ${reason}` });
          await cancelTempBan(ctx.guild.id, member.id);
          await addModCase({ guildId: ctx.guild.id, userId: member.id, moderatorId: ctx.user?.id, type: "ban", reason });

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

          await logAction(ctx.guild, {
            title: "Usuario baneado",
            color: RED,
            fields: [
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "Razón", value: reason, inline: false },
              { name: "Mensajes borrados", value: `${days} días`, inline: true },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No pude banear al usuario");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "unban", description: "Revoca el ban de un usuario por ID" }),
      params: new ParamsBuilder()
        .addString({ name: "id", description: "ID del usuario", required: true })
        .addString({ name: "razon", description: "Motivo del unban (opcional)", required: false }),
      plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

      async code(ctx) {
        await ctx.defer();
        const userId = ctx.get("id");
        const reason = ctx.get("razon") ?? "Sin razón";
        const tag = modTag(ctx);

        try {
          const ban = await ctx.guild.bans.fetch(userId).catch(() => null);
          if (!ban) return ctx.ephemeral("Ese usuario no está baneado");

          await notifyUser(ban.user, {
            color: GREEN,
            description: `Fuiste desbaneado de **${ctx.guild.name}**\nRazón: ${reason}`,
          });

          await ctx.guild.members.unban(userId, `${tag}: ${reason}`);
          await cancelTempBan(ctx.guild.id, userId);
          await addModCase({ guildId: ctx.guild.id, userId, moderatorId: ctx.user?.id, type: "unban", reason });

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

          await logAction(ctx.guild, {
            title: "Usuario desbaneado",
            color: GREEN,
            fields: [
              { name: "Usuario", value: `${ban.user.tag} (\`${userId}\`)`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "Razón", value: reason, inline: false },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudo desbanear al usuario, verifica que el ID sea correcto");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "softban", description: "Banea y desbanea al instante para limpiar mensajes recientes" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a aplicar softban", required: true })
        .addString({ name: "razon", description: "Motivo de la sanción (opcional)", required: false })
        .addString({ name: "dias", description: "Días de mensajes a eliminar (1-7)", required: false }),
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
          await notifyUser(member.user, {
            description: `Fuiste softbaneado de **${ctx.guild.name}**\nRazón: ${reason}`,
          });

          await member.ban({ deleteMessageSeconds: days * 86400, reason: `[SOFTBAN] ${tag}: ${reason}` });
          await ctx.guild.members.unban(member.id, `[SOFTBAN] ${tag}`);
          await addModCase({ guildId: ctx.guild.id, userId: member.id, moderatorId: ctx.user?.id, type: "softban", reason });

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

          await logAction(ctx.guild, {
            title: "Usuario softbaneado",
            color: RED,
            fields: [
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "Razón", value: reason, inline: false },
              { name: "Mensajes", value: `${days} días borrados`, inline: true },
            ],
            footer: "El usuario puede volver a entrar al servidor",
          });
        } catch (err) {
          return failWith(ctx, err, "No pude softbanear al usuario");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "tempban", description: "Banea temporalmente a un usuario del servidor" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a banear", required: true })
        .addString({ name: "duracion", description: "Duración (ej: 1h, 30m, 2d)", required: true })
        .addString({ name: "razon", description: "Motivo de la sanción (opcional)", required: false }),
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

          await notifyUser(member.user, {
            description: `Fuiste tempbaneado de **${ctx.guild.name}**`,
            fields: [
              { name: "Razón", value: reason, inline: true },
              { name: "Duración", value: formatDuration(duration), inline: true },
            ],
          });

          await member.ban({ reason: `[TEMPBAN ${formatDuration(duration)}] ${tag}: ${reason}` });

          await upsertTempBan({ guildId: ctx.guild.id, userId: member.id, unbanAt });
          scheduleTempUnban(ctx.guild.client, ctx.guild.id, member.id, unbanAt);
          await addModCase({ guildId: ctx.guild.id, userId: member.id, moderatorId: ctx.user?.id, type: "tempban", reason, durationMs: duration });

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

          await logAction(ctx.guild, {
            title: "Usuario tempbaneado",
            color: RED,
            fields: [
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "Duración", value: formatDuration(duration), inline: true },
              { name: "Expira", value: `<t:${Math.floor(unbanAt.getTime() / 1000)}:R>`, inline: true },
              { name: "Razón", value: reason, inline: false },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No pude hacer el tempban");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "massban", description: "Banea simultáneamente hasta 5 usuarios" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario1", description: "Usuario 1", required: true })
        .addMember({ name: "usuario2", description: "Usuario 2", required: false })
        .addMember({ name: "usuario3", description: "Usuario 3", required: false })
        .addMember({ name: "usuario4", description: "Usuario 4", required: false })
        .addMember({ name: "usuario5", description: "Usuario 5", required: false })
        .addString({ name: "razon", description: "Motivo de la sanción (opcional)", required: false }),
      plugins: [Plugins.hasPerms("BanMembers"), Plugins.hasBotPerms("BanMembers")],

      async code(ctx) {
        await ctx.defer();

        const rawUsers = [1, 2, 3, 4, 5].map((i) => ctx.get(`usuario${i}`)).filter(Boolean);
        const seenIds = new Set();
        const users = rawUsers.filter((u) => {
          if (!u?.id || seenIds.has(u.id)) return false;
          seenIds.add(u.id);
          return true;
        });
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
            await notifyUser(member.user, {
              description: `Fuiste baneado de **${ctx.guild.name}**\nRazón: ${reason}`,
            });

            await ctx.guild.members.ban(member, { reason: `[MASSBAN] ${tag}: ${reason}` });
            await cancelTempBan(ctx.guild.id, member.id);
            await addModCase({ guildId: ctx.guild.id, userId: member.id, moderatorId: ctx.user?.id, type: "ban", reason });
            banned.push(member);
          } catch {
            failed.push(member);
          }
        }

        const memberTag = (m) => (m?.user ?? m)?.tag ?? (m?.user ?? m)?.username ?? m?.id ?? "unknown";
        const desc = banned.map((m, i) => `${i + 1}. ${memberTag(m)}`).join("\n") || "Ninguno";

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

        const logFields = [
          { name: "Moderador", value: tag, inline: true },
          { name: "Baneados", value: `${banned.length}`, inline: true },
          { name: "Fallidos", value: `${failed.length}`, inline: true },
          { name: "Razón", value: reason, inline: false },
        ];
        if (failed.length) {
          logFields.push({ name: "No se pudo banear a", value: failed.map(memberTag).join(", ") });
        }

        await logAction(ctx.guild, {
          title: "Massban ejecutado",
          color: RED,
          fields: logFields,
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "kick", description: "Expulsa a un usuario del servidor (kick)" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a expulsar", required: true })
        .addString({ name: "razon", description: "Motivo de la sanción (opcional)", required: false }),
      plugins: [Plugins.hasPerms("KickMembers"), Plugins.hasBotPerms("KickMembers")],

      async code(ctx) {
        await ctx.defer();

        const member = ctx.get("usuario");
        const reason = ctx.get("razon") ?? "Sin razón";
        const tag = modTag(ctx);

        const hierr = hierarchyChecks(ctx, member, "expulsar a");
        if (hierr) return ctx.ephemeral(hierr);

        try {
          await notifyUser(member.user, {
            description: `Fuiste expulsado de **${ctx.guild.name}**\nRazón: ${reason}`,
          });

          await member.kick(`${tag}: ${reason}`);
          await addModCase({ guildId: ctx.guild.id, userId: member.id, moderatorId: ctx.user?.id, type: "kick", reason });

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

          await logAction(ctx.guild, {
            title: "Usuario expulsado",
            color: RED,
            fields: [
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "Razón", value: reason, inline: false },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudo expulsar al usuario");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "mute", description: "Silencia temporalmente a un usuario (timeout)" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a silenciar", required: true })
        .addString({ name: "duracion", description: "Duración (ej: 10m, 1h, 1d)", required: true })
        .addString({ name: "razon", description: "Motivo de la sanción (opcional)", required: false }),
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
          await addModCase({ guildId: ctx.guild.id, userId: member.id, moderatorId: ctx.user?.id, type: "mute", reason, durationMs: duration });

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

          await notifyUser(member.user, {
            description: `Fuiste silenciado en **${ctx.guild.name}** por **${tiempo}**`,
            fields: [{ name: "Razón", value: reason }],
          });

          await logAction(ctx.guild, {
            title: "Usuario silenciado",
            color: RED,
            fields: [
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "Duración", value: tiempo, inline: true },
              { name: "Expira", value: `<t:${expireTs}:R>`, inline: true },
              { name: "Razón", value: reason, inline: false },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudo silenciar al usuario");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "unmute", description: "Remueve el silencio (timeout) de un usuario" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a restaurar", required: true })
        .addString({ name: "razon", description: "Motivo (opcional)", required: false }),
      plugins: [Plugins.hasPerms("ModerateMembers"), Plugins.hasBotPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();

        const member = ctx.get("usuario");
        const reason = ctx.get("razon") ?? "Sin razón";
        const tag = modTag(ctx);

        const hierr = hierarchyChecks(ctx, member, "quitar el silencio a");
        if (hierr) return ctx.ephemeral(hierr);

        if (!member.communicationDisabledUntil) {
          return ctx.ephemeral("Ese usuario no está silenciado");
        }

        try {
          await member.timeout(null, `${tag}: ${reason}`);
          await addModCase({ guildId: ctx.guild.id, userId: member.id, moderatorId: ctx.user?.id, type: "unmute", reason });

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

          await notifyUser(member.user, {
            color: GREEN,
            description: `Tu silencio en **${ctx.guild.name}** fue removido`,
          });

          await logAction(ctx.guild, {
            title: "Silencio removido",
            color: GREEN,
            fields: [
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "Razón", value: reason, inline: false },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudo quitar el timeout");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "purge", description: "Elimina múltiples mensajes recientes del canal" }),
      params: new ParamsBuilder()
        .addString({ name: "cantidad", description: "Cantidad de mensajes a eliminar (1-100)", required: true })
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

          const targetUser = target?.user ?? target;
          const reply = await ctx.send(
            buildActionCard({
              title: "Mensajes eliminados",
              fields: [
                ["Canal", `${ctx.channel}`],
                ["Cantidad", V2Text.code(cantidad)],
                targetUser ? ["Usuario", userValue(targetUser)] : null,
              ].filter(Boolean),
              moderator: tag,
              color: GREEN,
            })
          );

          await logAction(ctx.guild, {
            title: "Purge ejecutado",
            color: GREEN,
            fields: [
              { name: "Canal", value: `${ctx.channel}`, inline: true },
              { name: "Mensajes eliminados", value: `${cantidad}`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "Filtro", value: targetUser ? `${targetUser.tag} (\`${targetUser.id}\`)` : "Ninguno", inline: false },
            ],
          });

          setTimeout(() => reply?.delete?.().catch(() => {}), 5000).unref();
        } catch (err) {
          return failWith(ctx, err, "No pude eliminar los mensajes — pueden ser demasiado antiguos");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "warn", description: "Registra una advertencia (warn) a un usuario" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario a advertir", required: true })
        .addString({ name: "razon", description: "Motivo de la advertencia", required: true }),
      plugins: [Plugins.hasPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();
        const member = ctx.get("usuario");
        const reason = ctx.get("razon");
        const tag = modTag(ctx);
        if (!member?.roles) {
          return ctx.ephemeral("No pude obtener al miembro en el servidor");
        }
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

          const escalation = await applyWarnEscalation(ctx.guild, member, total);

          const warnFields = [
            ["Usuario", userValue(member.user)],
            ["ID de advertencia", V2Text.code(warnId)],
            ["Total", V2Text.code(total)],
            ["Razón", V2Text.clip(reason, 300, "Sin razón")],
          ];
          if (escalation?.muted) {
            warnFields.push(["Auto-moderación", escalation.reason]);
          }

          await ctx.send(
            buildActionCard({
              title: "Usuario advertido",
              thumbnail: avatarUrl(member.user),
              fields: warnFields,
              moderator: tag,
              color: YELLOW,
            })
          );

          await logAction(ctx.guild, {
            title: "Usuario Advertido",
            color: YELLOW,
            fields: [
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Moderador", value: tag, inline: true },
              { name: "ID", value: `\`${warnId}\``, inline: true },
              { name: "Total warns", value: `${total}`, inline: true },
              { name: "Razón", value: reason, inline: false },
            ],
          });

          await notifyUser(member.user, {
            color: YELLOW,
            description: `Fuiste advertido en **${ctx.guild.name}**`,
            fields: [
              { name: "Razón", value: reason },
              { name: "Total warns", value: `${total}`, inline: true },
              { name: "ID", value: `\`${warnId}\``, inline: true },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudo registrar la advertencia");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "removewarn", description: "Elimina una advertencia específica por ID" }),
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

          await logAction(ctx.guild, {
            description: `Advertencia \`${warnId}\` de **${username}** eliminada`,
            color: GREEN,
            timestamp: false,
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudo eliminar la advertencia");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "clearwarns", description: "Elimina todas las advertencias de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Usuario objetivo", required: true }),
      plugins: [Plugins.hasPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();
        const member = ctx.get("usuario");
        const targetUser = member?.user ?? member;
        const tag = modTag(ctx);

        try {
          const deletedCount = await clearWarnsForUser({ guildId: ctx.guild.id, userId: targetUser.id });
          if (!deletedCount) {
            return ctx.ephemeral(`${targetUser.tag} no tiene advertencias`);
          }

          const username = targetUser.globalName || targetUser.username;

          await ctx.send(
            buildActionCard({
              title: "Advertencias eliminadas",
              thumbnail: avatarUrl(targetUser),
              fields: [
                ["Usuario", userValue(targetUser)],
                ["Cantidad", V2Text.code(deletedCount)],
              ],
              moderator: tag,
              color: GREEN,
            })
          );

          await logAction(ctx.guild, {
            description: `Se eliminaron **${deletedCount}** advertencia${deletedCount !== 1 ? "s" : ""} de **${username}**`,
            color: GREEN,
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudieron limpiar las advertencias");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "warnings", description: "Historial de sanciones y advertencias de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Usuario a consultar", required: true }),
      plugins: [Plugins.hasPerms("ModerateMembers")],

      async code(ctx) {
        await ctx.defer();
        const member = ctx.get("usuario");
        const targetUser = member?.user ?? member;
        const authorId = ctx.user?.id;

        try {
          const cases = await listUnifiedHistoryForUser({ guildId: ctx.guild.id, userId: targetUser.id });
          if (!cases.length) {
            return ctx.ephemeral(`${targetUser.tag} no tiene sanciones registradas`);
          }

          const paginator = createListPaginator({
            items: cases,
            perPage: 5,
            ownerId: authorId,
            render: ({ items: pageCases, pageIndex, totalPages, controls }) => {
              const builder = new ComponentsV2Builder({ color: YELLOW }).addSection(
                [
                  V2Text.heading(`Historial de ${V2Text.clip(targetUser.tag, 100)}`, 3),
                  V2Text.subtext(`Página ${pageIndex + 1}/${totalPages} · ${cases.length} en total`),
                ],
                { thumbnail: targetUser.displayAvatarURL({ size: 256 }) }
              );

              for (const c of pageCases) {
                const ts = Math.floor(new Date(c.createdAt).getTime() / 1000);
                const reason = V2Text.clip(c.reason, 500, "Sin razón");
                const typeLabel = CASE_TYPE_LABELS[c.type] ?? c.type;
                const durSuffix = c.durationMs ? ` (${formatDuration(c.durationMs)})` : "";
                builder.addSeparator("small").addText(
                  `**[${typeLabel}${durSuffix}] \`${c.caseId}\`** — <t:${ts}:d>\n${V2Text.fields([
                    ["Razón", reason],
                    ["Mod", `<@${c.moderator}>`],
                  ])}`
                );
              }

              if (controls?.length) {
                builder.addSeparator("small").addButtonsRow(controls);
              }

              return builder;
            },
          });

          await paginator.send(ctx);
        } catch (err) {
          return failWith(ctx, err, "No se pudo obtener el historial de sanciones");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "setlogs", description: "Configura el canal de logs de moderación" }),
      params: new ParamsBuilder().addChannel({
        name: "canal",
        description: "Canal de texto para logs",
        required: true,
        channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      }),
      plugins: [Plugins.hasPerms("ManageGuild")],

      async code(ctx) {
        await ctx.defer();
        const channel = ctx.get("canal");
        const tag = modTag(ctx);
        if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel?.type)) {
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
      data: new CommandBuilder({ name: "removelogs", description: "Desactiva el canal de logs del servidor" }),
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
    })
    .addCommand({
      data: new CommandBuilder({
        name: "automod",
        description: "Configura el filtro automático ampliado y respuestas personalizadas",
      }),
      params: new ParamsBuilder()
        .addString({
          name: "estado",
          description: "Activar o desactivar AutoMod",
          required: false,
          choices: [{ name: "Activar", value: "on" }, { name: "Desactivar", value: "off" }],
        })
        .addString({
          name: "accion",
          description: "Sanción al detectar infracción",
          required: false,
          choices: [
            { name: "Solo borrar", value: "delete" },
            { name: "Borrar + Warn", value: "warn" },
            { name: "Borrar + Mute 5m", value: "mute" },
            { name: "Borrar + Kick", value: "kick" },
          ],
        })
        .addString({
          name: "antispam",
          description: "Detectar mensajes repetidos rápidos",
          required: false,
          choices: [{ name: "Sí", value: "true" }, { name: "No", value: "false" }],
        })
        .addString({
          name: "antiinvites",
          description: "Bloquear invitaciones de Discord",
          required: false,
          choices: [{ name: "Sí", value: "true" }, { name: "No", value: "false" }],
        })
        .addString({
          name: "antilinks",
          description: "Bloquear enlaces http/https",
          required: false,
          choices: [{ name: "Sí", value: "true" }, { name: "No", value: "false" }],
        })
        .addString({
          name: "anticaps",
          description: "Bloquear exceso de mayúsculas",
          required: false,
          choices: [{ name: "Sí", value: "true" }, { name: "No", value: "false" }],
        })
        .addString({
          name: "antimentions",
          description: "Bloquear menciones masivas (>=5)",
          required: false,
          choices: [{ name: "Sí", value: "true" }, { name: "No", value: "false" }],
        })
        .addString({ name: "palabras", description: "Lista separada por comas de palabras bloqueadas", required: false })
        .addString({ name: "mensaje_custom", description: "Respuesta custom al sancionar ({user}, {reason})", required: false }),
      plugins: [Plugins.hasPerms("ManageGuild"), Plugins.hasBotPerms("ManageMessages")],
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const patch = {};
        if (ctx.get("estado")) patch.enabled = ctx.get("estado") === "on";
        if (ctx.get("accion")) patch.action = ctx.get("accion");
        if (ctx.get("antispam")) patch.antiSpam = ctx.get("antispam") === "true";
        if (ctx.get("antiinvites")) patch.antiInvites = ctx.get("antiinvites") === "true";
        if (ctx.get("antilinks")) patch.antiLinks = ctx.get("antilinks") === "true";
        if (ctx.get("anticaps")) patch.antiCaps = ctx.get("anticaps") === "true";
        if (ctx.get("antimentions")) patch.antiMentions = ctx.get("antimentions") === "true";
        if (ctx.get("palabras") !== null && ctx.get("palabras") !== undefined) {
          patch.blockedWords = String(ctx.get("palabras"))
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 100);
        }
        if (ctx.get("mensaje_custom") !== null && ctx.get("mensaje_custom") !== undefined) {
          patch.customMessage = String(ctx.get("mensaje_custom")).trim().slice(0, 400);
        }

        const initialCfg = (Object.keys(patch).length
          ? await updateAutomodConfig(ctx.guild.id, patch)
          : null) ?? (await getAutomodConfig(ctx.guild.id));

        const buildAutomodFiltersModal = (modalId, currentCfg) => {
          const chSelect = new ChannelSelectMenuBuilder()
            .setCustomId("ignored_channels")
            .setPlaceholder("Canales exentos del filtro...")
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
            .setMinValues(0)
            .setMaxValues(10)
            .setRequired(false);
          if (currentCfg.ignoredChannels?.length) {
            chSelect.setDefaultChannels(currentCfg.ignoredChannels.slice(0, 10));
          }

          const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId("ignored_roles")
            .setPlaceholder("Roles exentos del filtro...")
            .setMinValues(0)
            .setMaxValues(10)
            .setRequired(false);
          if (currentCfg.ignoredRoles?.length) {
            roleSelect.setDefaultRoles(currentCfg.ignoredRoles.slice(0, 10));
          }

          return new ModalBuilder()
            .setCustomId(modalId)
            .setTitle("Configurar AutoMod")
            .addLabelComponents(
              new LabelBuilder()
                .setLabel("Filtros activos")
                .setCheckboxGroupComponent(
                  new CheckboxGroupBuilder()
                    .setCustomId("filters")
                    .setRequired(false)
                    .setMinValues(0)
                    .setMaxValues(5)
                    .addOptions(
                      new CheckboxGroupOptionBuilder().setLabel("AntiSpam").setValue("antiSpam").setDescription("Mensajes repetidos rápidos").setDefault(Boolean(currentCfg.antiSpam)),
                      new CheckboxGroupOptionBuilder().setLabel("AntiInvites").setValue("antiInvites").setDescription("Invitaciones de Discord").setDefault(Boolean(currentCfg.antiInvites)),
                      new CheckboxGroupOptionBuilder().setLabel("AntiLinks").setValue("antiLinks").setDescription("Enlaces externos http/https").setDefault(Boolean(currentCfg.antiLinks)),
                      new CheckboxGroupOptionBuilder().setLabel("AntiCaps").setValue("antiCaps").setDescription("Exceso de mayúsculas").setDefault(Boolean(currentCfg.antiCaps)),
                      new CheckboxGroupOptionBuilder().setLabel("AntiMentions").setValue("antiMentions").setDescription("Menciones masivas (>=5)").setDefault(Boolean(currentCfg.antiMentions))
                    )
                ),
              new LabelBuilder()
                .setLabel("Sanción por infracción")
                .setRadioGroupComponent(
                  new RadioGroupBuilder()
                    .setCustomId("action")
                    .setRequired(true)
                    .addOptions(
                      new RadioGroupOptionBuilder().setLabel("Solo borrar mensaje").setValue("delete").setDefault(currentCfg.action === "delete"),
                      new RadioGroupOptionBuilder().setLabel("Borrar + Warn").setValue("warn").setDefault(!currentCfg.action || currentCfg.action === "warn"),
                      new RadioGroupOptionBuilder().setLabel("Borrar + Mute 5m").setValue("mute").setDefault(currentCfg.action === "mute"),
                      new RadioGroupOptionBuilder().setLabel("Borrar + Kick").setValue("kick").setDefault(currentCfg.action === "kick")
                    )
                ),
              new LabelBuilder()
                .setLabel("Canales ignorados (opcional)")
                .setChannelSelectMenuComponent(chSelect),
              new LabelBuilder()
                .setLabel("Roles ignorados (opcional)")
                .setRoleSelectMenuComponent(roleSelect)
            );
        };

        const renderAutomodCard = ({ state, view, isEnded }) => {
          const currentCfg = state.cfg;
          const activeFilters = [
            currentCfg.antiSpam && "AntiSpam",
            currentCfg.antiInvites && "AntiInvites",
            currentCfg.antiLinks && "AntiLinks",
            currentCfg.antiCaps && "AntiCaps",
            currentCfg.antiMentions && "AntiMentions",
            currentCfg.blockedWords?.length && `Palabras(${currentCfg.blockedWords.length})`,
          ].filter(Boolean).join(", ") || "Ninguno";

          const card = buildActionCard({
            title: "Configuración AutoMod",
            fields: [
              ["Estado", V2Text.code(currentCfg.enabled ? "Activado" : "Desactivado")],
              ["Acción", V2Text.code(currentCfg.action)],
              ["Filtros activos", V2Text.code(activeFilters)],
              currentCfg.customMessage ? ["Mensaje custom", V2Text.clip(currentCfg.customMessage, 200)] : null,
              currentCfg.ignoredChannels?.length ? ["Canales exentos", currentCfg.ignoredChannels.slice(0, 5).map((id) => `<#${id}>`).join(", ")] : null,
              currentCfg.ignoredRoles?.length ? ["Roles exentos", currentCfg.ignoredRoles.slice(0, 5).map((id) => `<@&${id}>`).join(", ")] : null,
            ].filter(Boolean),
            moderator: modTag(ctx),
            color: currentCfg.enabled ? GREEN : RED,
          });

          if (!isEnded && view) {
            card.addSpacer("small").addButtonsRow([
              { customId: view.id("filters"), label: "Configurar filtros", style: "secondary" },
              {
                customId: view.id("toggle"),
                label: currentCfg.enabled ? "Desactivar" : "Activar",
                style: currentCfg.enabled ? "secondary" : "danger",
              },
            ]);
          }
          return card;
        };

        const view = new V2View({
          authorId: ctx.user?.id,
          timeout: 3 * 60_000,
          thirdPartyMode: "reject",
          thirdPartyMessage: "No puedes usar este panel",
          onEnd: "static",
          state: { cfg: initialCfg },
          render: renderAutomodCard,
          renderStatic: (args) => renderAutomodCard({ ...args, isEnded: true }),
          actions: {
            toggle: async ({ state, setState }) => {
              const updated = await updateAutomodConfig(ctx.guild.id, { enabled: !state.cfg.enabled });
              if (updated) setState({ cfg: updated });
            },
            filters: async ({ interaction, state, view: activeView }) => {
              const modalId = activeView.id("ammodal", Date.now().toString(36));
              await interaction.showModal(buildAutomodFiltersModal(modalId, state.cfg));

              const submitted = await interaction
                .awaitModalSubmit({
                  time: 3 * 60_000,
                  filter: (i) => i.customId === modalId && i.user.id === ctx.user?.id,
                })
                .catch(() => null);
              if (!submitted) return false;

              const selectedFilters = new Set(submitted.fields.getCheckboxGroup("filters") ?? []);
              const selectedAction = submitted.fields.getRadioGroup("action") || state.cfg.action;
              const chCol = submitted.fields.getSelectedChannels("ignored_channels", false);
              const roleCol = submitted.fields.getSelectedRoles("ignored_roles", false);

              const nextPatch = {
                antiSpam: selectedFilters.has("antiSpam"),
                antiInvites: selectedFilters.has("antiInvites"),
                antiLinks: selectedFilters.has("antiLinks"),
                antiCaps: selectedFilters.has("antiCaps"),
                antiMentions: selectedFilters.has("antiMentions"),
                action: selectedAction,
                ignoredChannels: chCol ? [...chCol.keys()].slice(0, 20) : [],
                ignoredRoles: roleCol ? [...roleCol.keys()].filter((id) => id !== ctx.guild.id).slice(0, 20) : [],
              };

              const saved = await updateAutomodConfig(ctx.guild.id, nextPatch);
              await submitted.deferUpdate().catch(() => {});
              if (saved) {
                activeView.setState({ cfg: saved });
                if (activeView.message?.editable) {
                  await activeView.message.edit(activeView.toPayload()).catch(() => {});
                }
              }
              return false;
            },
          },
        });

        await view.send(ctx);
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "automod-ai",
        description: "Convierte lenguaje natural en reglas nativas de Discord AutoMod (0ms)",
        cooldown: { seconds: 8, bucket: "GUILD" },
      }),
      params: new ParamsBuilder()
        .addString({
          name: "instruccion",
          description: "Describe la regla (ej: bloquea links acortados e invitaciones excepto @Mods)",
          required: false,
          max_length: 500,
        })
        .addString({
          name: "accion",
          description: "Crear regla con IA o gestionar reglas nativas existentes",
          required: false,
          choices: [
            { name: "Crear con IA", value: "create" },
            { name: "Listar / Gestionar reglas", value: "list" },
          ],
        })
        .addChannel({
          name: "canal_alerta",
          description: "Canal donde Discord enviará alertas de esta regla (opcional)",
          required: false,
          channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        })
        .addRole({
          name: "rol_exento",
          description: "Rol que ignorará esta regla (opcional)",
          required: false,
        })
        .addChannel({
          name: "canal_exento",
          description: "Canal donde esta regla no aplicará (opcional)",
          required: false,
        }),
      plugins: [Plugins.hasPerms("ManageGuild"), Plugins.hasBotPerms("ManageGuild")],
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);

        const actionMode = ctx.get("accion") || (ctx.get("instruccion") ? "create" : "list");
        const instruction = String(ctx.get("instruccion") ?? "").trim().slice(0, 500);
        const guild = ctx.guild;
        const modUserTag = modTag(ctx);

        if (actionMode === "list" || !instruction) {
          await ctx.defer();
          let fetched;
          try {
            fetched = await guild.autoModerationRules.fetch({ cache: false });
          } catch (err) {
            return failWith(ctx, err, "No pude leer las reglas de AutoMod nativo de este servidor.");
          }

          const rules = [...fetched.values()];
          if (!rules.length) {
            return ctx.send(
              ComponentsV2Builder.card({
                title: "AutoMod nativo de Discord",
                description:
                  "Este servidor aún no tiene reglas nativas de AutoMod configuradas.\n\n" +
                  "Usa `/mod automod-ai instruccion:\"bloquea estafas de nitro y links acortados excepto @Staff\"` para crear una en segundos.",
                color: RED,
              })
            );
          }

          const formatRuleLine = (r, idx) => {
            const statusDot = r.enabled ? "🟢" : "🔴";
            const trig = TRIGGER_LABELS[r.triggerType] ?? `Tipo ${r.triggerType}`;
            const acts = (r.actions ?? []).map((a) => {
              if (a.type === AutoModerationActionType.BlockMessage) return "Bloquear";
              if (a.type === AutoModerationActionType.Timeout) return `Timeout ${a.metadata?.durationSeconds ?? 60}s`;
              if (a.type === AutoModerationActionType.SendAlertMessage) return a.metadata?.channelId ? `Alerta <#${a.metadata.channelId}>` : "Alerta";
              return "Acción";
            }).join(" + ");
            return `**${idx + 1}.** ${statusDot} **${V2Text.clip(r.name, 55)}** · \`${trig}\`\n> ${acts}`;
          };

          const renderList = ({ state, view, isEnded }) => {
            const selected = state.rules.find((r) => r.id === state.selectedId) ?? state.rules[0];
            const lines = state.rules.map(formatRuleLine);
            const builder = new ComponentsV2Builder({ color: RED })
              .addText(`${V2Text.heading(`Reglas AutoMod Nativas (${state.rules.length})`, 3)}\n${V2Text.subtext(guild.name)}`)
              .addSeparator("small")
              .addText(V2Text.clip(lines.join("\n"), 3200));

            if (!isEnded && view && state.rules.length) {
              builder.addSpacer("small").addSelectMenu({
                customId: view.id("pick"),
                placeholder: "Selecciona una regla para gestionar...",
                options: state.rules.slice(0, 25).map((r) => ({
                  label: `${r.enabled ? "🟢" : "🔴"} ${V2Text.clip(r.name, 70)}`,
                  value: r.id,
                  description: TRIGGER_LABELS[r.triggerType] ?? "Regla AutoMod",
                  default: r.id === selected?.id,
                })),
              });
              if (selected) {
                builder.addSpacer("small").addButtonsRow([
                  {
                    customId: view.id("toggle"),
                    label: selected.enabled ? "Desactivar regla" : "Activar regla",
                    style: selected.enabled ? "secondary" : "danger",
                  },
                  {
                    customId: view.id("remove"),
                    label: "Eliminar regla",
                    style: "danger",
                  },
                ]);
              }
            }
            return builder;
          };

          const listView = new V2View({
            authorId: ctx.user?.id,
            timeout: 3 * 60_000,
            thirdPartyMode: "reject",
            thirdPartyMessage: "No puedes gestionar este panel",
            onEnd: "static",
            state: { rules, selectedId: rules[0]?.id ?? null },
            render: renderList,
            renderStatic: (args) => renderList({ ...args, isEnded: true }),
            actions: {
              pick: ({ values, setState }) => {
                if (!values[0]) return false;
                setState({ selectedId: values[0] });
              },
              toggle: async ({ state, setState, interaction }) => {
                const target = state.rules.find((r) => r.id === state.selectedId) ?? state.rules[0];
                if (!target) return false;
                try {
                  const updated = await guild.autoModerationRules.edit(target.id, {
                    enabled: !target.enabled,
                    reason: `${modUserTag}: automod-ai toggle`,
                  });
                  const nextRules = state.rules.map((r) => (r.id === updated.id ? updated : r));
                  setState({ rules: nextRules, selectedId: updated.id });
                } catch {
                  await interaction.reply({ content: "No pude modificar esa regla en Discord.", flags: MessageFlags.Ephemeral }).catch(() => {});
                  return false;
                }
              },
              remove: async ({ state, setState, interaction }) => {
                const target = state.rules.find((r) => r.id === state.selectedId) ?? state.rules[0];
                if (!target) return false;
                try {
                  await guild.autoModerationRules.delete(target.id, `${modUserTag}: automod-ai delete`);
                  const nextRules = state.rules.filter((r) => r.id !== target.id);
                  setState({ rules: nextRules, selectedId: nextRules[0]?.id ?? null });
                } catch {
                  await interaction.reply({ content: "No pude eliminar esa regla en Discord.", flags: MessageFlags.Ephemeral }).catch(() => {});
                  return false;
                }
              },
            },
          });

          return listView.send(ctx);
        }

        await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });

        try {
          const alertChannel = ctx.get("canal_alerta") ?? null;
          const exemptRole = ctx.get("rol_exento") ?? null;
          const exemptChannel = ctx.get("canal_exento") ?? null;

          const [existingRules, dramaId, logId] = await Promise.all([
            guild.autoModerationRules.fetch({ cache: false }).catch(() => null),
            getDramaChannelId(guild.id),
            getLogChannelId(guild.id),
          ]);

          const defaultAlertChannelId = dramaId || logId || null;
          const compiled = await compileNaturalLanguageRule({
            guild,
            instruction,
            alertChannel,
            exemptRole,
            exemptChannel,
            defaultAlertChannelId,
          });

          if (compiled.error === "ai_failed") {
            return ctx.ephemeral("La IA no pudo interpretar esa instrucción en este momento. Intenta describir la regla más directo.");
          }
          if (compiled.error === "empty_trigger") {
            return ctx.ephemeral("No detecté palabras clave, patrones ni tipo de filtro válidos en tu descripción. Sé un poco más específico.");
          }
          if (!compiled.ok || !compiled.spec) {
            return ctx.ephemeral("No se pudo generar la regla de AutoMod.");
          }

          const existingArr = existingRules ? [...existingRules.values()] : [];
          const sameType = existingArr.filter((r) => r.triggerType === compiled.spec.triggerType);
          const quota = TRIGGER_QUOTAS[compiled.spec.triggerType] ?? 1;
          const willReplaceExisting = quota === 1 && sameType.length >= 1 ? sameType[0] : null;

          if (quota > 1 && sameType.length >= quota) {
            return ctx.ephemeral(
              `Ya alcanzaste el límite nativo de Discord (${sameType.length}/${quota}) para reglas de **${TRIGGER_LABELS[compiled.spec.triggerType]}**. Usa \`/mod automod-ai accion:list\` para eliminar o editar alguna.`
            );
          }

          const renderPreview = ({ state, view, isEnded }) => {
            if (state.status === "applied") {
              return buildActionCard({
                title: state.replaced ? "Regla AutoMod actualizada" : "Regla AutoMod creada",
                subtitle: `${TRIGGER_LABELS[state.spec.triggerType] ?? "AutoMod"} · Latencia 0 ms`,
                fields: [
                  ["Regla", V2Text.code(state.spec.name)],
                  ["Estado", V2Text.code("Activa en Discord")],
                  state.spec.alertChannelId && state.spec.sendAlert ? ["Alertas", `<#${state.spec.alertChannelId}>`] : null,
                ].filter(Boolean),
                moderator: modUserTag,
                color: GREEN,
              });
            }
            if (state.status === "cancelled") {
              return ComponentsV2Builder.card({ title: "AutoMod IA cancelado", description: "No se aplicaron cambios en Discord.", color: RED });
            }
            const controls = !isEnded && view
              ? [
                  {
                    customId: view.id("apply"),
                    label: willReplaceExisting ? "Reemplazar regla en Discord" : "Aplicar en Discord",
                    style: "danger",
                  },
                  { customId: view.id("edit"), label: "Editar opciones", style: "secondary" },
                  { customId: view.id("cancel"), label: "Cancelar", style: "secondary" },
                ]
              : null;
            return buildNativeRulePreviewCard(state.spec, {
              sameTypeCount: sameType.length,
              existingRuleName: willReplaceExisting?.name ?? null,
              warnings: state.warnings,
              controls,
              color: RED,
            });
          };

          const previewView = new V2View({
            authorId: ctx.user?.id,
            timeout: 3 * 60_000,
            thirdPartyMode: "reject",
            thirdPartyMessage: "No puedes confirmar esta regla",
            onEnd: "static",
            state: { spec: compiled.spec, warnings: compiled.warnings ?? [], status: "pending", replaced: false },
            render: renderPreview,
            renderStatic: (args) => renderPreview({ ...args, isEnded: true }),
            actions: {
              cancel: ({ setState, view }) => {
                setState({ status: "cancelled" });
                view.stop("cancelled");
              },
              apply: async ({ state, setState, view, interaction }) => {
                try {
                  let savedRule;
                  if (willReplaceExisting) {
                    savedRule = await guild.autoModerationRules.edit(
                      willReplaceExisting.id,
                      buildNativeRuleEditPayload(state.spec)
                    );
                  } else {
                    savedRule = await guild.autoModerationRules.create(buildNativeRulePayload(state.spec));
                  }
                  await logAction(guild, {
                    title: willReplaceExisting ? "Regla AutoMod Nativa actualizada" : "Regla AutoMod Nativa creada",
                    color: GREEN,
                    fields: [
                      { name: "Regla", value: `${savedRule.name} (\`${savedRule.id}\`)`, inline: true },
                      { name: "Tipo", value: TRIGGER_LABELS[state.spec.triggerType] ?? String(state.spec.triggerType), inline: true },
                      { name: "Moderador", value: modUserTag, inline: true },
                    ],
                  });
                  setState({ status: "applied", replaced: Boolean(willReplaceExisting) });
                  view.stop("applied");
                } catch (apiErr) {
                  log.error?.("[mod automod-ai apply]", { err: apiErr?.message ?? String(apiErr) });
                  await interaction.reply({
                    content: `Discord rechazó la regla: \`${V2Text.clip(apiErr?.message ?? "Error de permisos o formato", 160)}\``,
                    flags: MessageFlags.Ephemeral,
                  }).catch(() => {});
                  return false;
                }
              },
              edit: async ({ state, interaction, view: activeView }) => {
                const modalId = activeView.id("amai_edit", Date.now().toString(36));
                await interaction.showModal(buildAutoModEditModal(modalId, state.spec));

                const submitted = await interaction
                  .awaitModalSubmit({
                    time: 3 * 60_000,
                    filter: (i) => i.customId === modalId && i.user.id === ctx.user?.id,
                  })
                  .catch(() => null);
                if (!submitted) return false;

                const nextName = submitted.fields.getTextInputValue("name")?.trim().slice(0, 100) || state.spec.name;
                const nextMsg = submitted.fields.getTextInputValue("custom_message")?.trim().slice(0, 150) ?? "";
                const chosenActions = new Set(submitted.fields.getCheckboxGroup("actions") ?? []);
                const rolesCol = submitted.fields.getSelectedRoles("exempt_roles", false);
                const chCol = submitted.fields.getSelectedChannels("exempt_channels", false);

                const canTimeout =
                  state.spec.triggerType === AutoModerationRuleTriggerType.Keyword ||
                  state.spec.triggerType === AutoModerationRuleTriggerType.MentionSpam;

                const nextSpec = {
                  ...state.spec,
                  name: nextName,
                  customMessage: nextMsg,
                  blockMessage: chosenActions.has("block"),
                  sendAlert: Boolean(chosenActions.has("alert") && state.spec.alertChannelId),
                  timeoutSeconds: canTimeout && chosenActions.has("timeout")
                    ? (state.spec.timeoutSeconds || 300)
                    : null,
                  exemptRoleIds: rolesCol ? [...rolesCol.keys()].filter((id) => id !== guild.id).slice(0, 20) : [],
                  exemptChannelIds: chCol ? [...chCol.keys()].slice(0, 50) : [],
                };
                if (!nextSpec.blockMessage && !nextSpec.sendAlert && !nextSpec.timeoutSeconds) {
                  nextSpec.blockMessage = true;
                }

                await submitted.deferUpdate().catch(() => {});
                activeView.setState({ spec: nextSpec });
                if (activeView.message?.editable) {
                  await activeView.message.edit(activeView.toPayload()).catch(() => {});
                }
                return false;
              },
            },
          });

          await previewView.send(ctx);
        } catch (err) {
          return failWith(ctx, err, "No se pudo procesar la regla de AutoMod con IA");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "dramawatcher",
        description: "Configura el canal de Drama Watcher para moderar con botones y emojis",
      }),
      params: new ParamsBuilder()
        .addChannel({ name: "canal", description: "Canal privado para alertas interactivas (omitir para desactivar)", required: false }),
      plugins: [Plugins.hasPerms("ManageGuild")],
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const ch = ctx.get("canal");
        if (ch && !ch.isTextBased?.()) return ctx.ephemeral("El canal debe ser de texto");

        await GuildConfig.findOneAndUpdate(
          { guildId: ctx.guild.id },
          { $set: { dramaChannelId: ch ? ch.id : null } },
          { upsert: true, returnDocument: "after" }
        );
        invalidateDramaChannelCache(ctx.guild.id);

        await ctx.send(buildActionCard({
          title: ch ? "Drama Watcher activado" : "Drama Watcher desactivado",
          description: ch
            ? `Las alertas de AutoMod llegarán a ${ch} con botones y emojis rápidos (🔨 Ban, 👢 Kick, 🔇 Mute, ⚠️ Warn, ✅ Ignorar).`
            : "Se desactivó el canal de Drama Watcher.",
          moderator: modTag(ctx),
          color: ch ? GREEN : RED,
        }));
      },
    }),
};

module.exports = { data };
