const { ChannelType, Constants, GuildFeature, PermissionFlagsBits } = require("discord.js");
const {
  GroupBuilder,
  CommandBuilder,
  ParamsBuilder,
  Plugins,
  ComponentsV2Builder,
  MessageFlags,
  V2Text,
  V2View,
} = require("gralonium");
const {
  Logger,
  noGuildReply,
  formatPermissionName: formatPerm,
  handleCommandError,
  buildActionCard,
  createListPaginator,
  avatarUrl,
  roleIconUrl,
  failWith,
  wait,
  formatRoleColorInfo,
  fetchComputedChannelPermissions,
} = require("../../src/runtime");
const { buildImageCard, buildListCard, slicePage } = require("../../src/shared/ui");
const { checkTargetChannelAccess, fetchBotMember } = require("../../src/shared/utils");
const { JoinRole, ReactionRolePanel, VoiceLink } = require("../../src/database");
const { logAction } = require("../../src/guild");
const { formatDuration, parseDuration } = require("../../src/moderation");
const {
  MAX_PANELS_PER_GUILD,
  MAX_ROLES_PER_GUILD,
  buildReactionRolePanelPayload,
  grantTempRole,
} = require("../../src/reactionRoles");
const { isValidMenuEmoji } = require("../../src/tickets");
const { RED, GREEN, DARK } = require("../../src/config");

const PAGE_SIZE = 15;

const log = new Logger("CMD_ROLE");

const MANAGE_ROLES_PLUGINS = [Plugins.hasPerms("ManageRoles"), Plugins.hasBotPerms("ManageRoles")];
const ADMIN_ROLE_PLUGINS = [Plugins.hasPerms("Administrator"), Plugins.hasBotPerms("ManageRoles")];

function roleHierarchyCheck(ctx, role) {
  if (!ctx.guild) return "Este comando solo funciona en servidores";
  if (!role) return "Rol no encontrado";
  if (role.managed) return "No puedo editar roles gestionados por integraciones";
  if (role.id === ctx.guild.id) return "No puedo editar el rol @everyone";
  const botMember = ctx.guild.members.me ?? ctx.guild.members.cache.get(ctx.client?.user?.id ?? ctx.bot?.user?.id);
  const botHighest = botMember?.roles?.highest?.position ?? 0;
  if (role.position >= botHighest) return "No puedo actuar sobre ese rol porque está por encima del mío";
  const isOwner = ctx.member?.id === ctx.guild.ownerId;
  if (!isOwner) {
    const userHighest = ctx.member?.roles?.highest?.position ?? -1;
    if (userHighest === -1 || role.position >= userHighest) {
      return "No puedes gestionar un rol con igual o mayor posición que tu rol más alto";
    }
  }
  return null;
}

const activeRoleOps = new Set();

async function executeBulkRole({
  ctx,
  role,
  action,
  filterMember,
  emptyMessage,
  actionWord,
  pastWord,
  title,
  color,
  modTag,
  extraLogFields = [],
}) {
  const guild = ctx.guild;
  if (!guild) return noGuildReply(ctx);

  const hierr = roleHierarchyCheck(ctx, role);
  if (hierr) return ctx.ephemeral(hierr);

  const lockKey = `${guild.id}:${role.id}`;
  if (activeRoleOps.has(lockKey)) {
    return ctx.ephemeral("Ya hay una operación masiva ejecutándose para este rol en este servidor.");
  }
  activeRoleOps.add(lockKey);

  try {
    if (guild.memberCount !== guild.members.cache.size) {
      await guild.members.fetch().catch(() => {});
    }

    const targets = guild.members.cache.filter(filterMember);
    if (!targets.size) {
      return ctx.ephemeral(emptyMessage);
    }

    const total = targets.size;
    const guildIcon = guild.iconURL?.({ size: 256 }) ?? null;
    let done = 0;
    let failed = 0;
    let consecutiveFails = 0;

    const buildProgressCard = (current) =>
      buildActionCard({
        title: `${actionWord} rol`,
        subtitle: guild.name,
        thumbnail: guildIcon,
        fields: [
          ["Procesados", V2Text.code(`${current} / ${total}`)],
          ["Fallidos", V2Text.code(failed)],
        ],
        sections: [{ heading: "Rol", rows: [["Rol", `${role}`]] }],
        moderator: modTag,
        color,
      });

    const msg = await ctx.send(buildProgressCard(0));

    for (const [, member] of targets) {
      if (consecutiveFails >= 10) {
        log.warn("Operación masiva abortada por 10 fallos consecutivos", { guildId: guild.id, roleId: role.id });
        break;
      }

      try {
        if (action === "add") {
          await member.roles.add(role, `${modTag}: ${title}`);
        } else {
          await member.roles.remove(role, `${modTag}: ${title}`);
        }
        done++;
        consecutiveFails = 0;
      } catch {
        failed++;
        consecutiveFails++;
      }

      await wait(1100);

      const processed = done + failed;
      if (processed % 10 === 0 || processed === total) {
        await msg?.edit?.(buildProgressCard(processed).toPayload()).catch(() => {});
      }
    }

    const finalCard = buildActionCard({
      title: `${pastWord}${consecutiveFails >= 10 ? " (interrumpido por errores)" : ""}`,
      subtitle: guild.name,
      thumbnail: guildIcon,
      fields: [
        [pastWord, V2Text.code(done)],
        ["Fallidos", V2Text.code(failed)],
        ["Total", V2Text.code(total)],
      ],
      sections: [{ heading: "Rol", rows: [["Rol", `${role}`]] }],
      moderator: modTag,
      color,
    });

    await msg?.edit?.(finalCard.toPayload()).catch(() => {});

    await logAction(guild, {
      title: `${title} ejecutado`,
      color,
      fields: [
        { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "Moderador", value: modTag, inline: true },
        { name: pastWord, value: `${done}`, inline: true },
        { name: "Fallidos", value: `${failed}`, inline: true },
        ...extraLogFields,
      ],
    });
  } finally {
    activeRoleOps.delete(lockKey);
  }
}

function buildRoleInfoCard(role, memberCount = null) {
  const colorInfo = formatRoleColorInfo(role);
  const color = colorInfo.primary || DARK;
  const rows = [
    ["ID", V2Text.code(role.id)],
    memberCount !== null && memberCount !== undefined ? ["Miembros", V2Text.code(memberCount)] : null,
    ["Color", V2Text.code(colorInfo.display)],
    ["Posición", V2Text.code(role.position)],
    ["Mencionable", V2Text.code(role.mentionable)],
    ["Gestionado", V2Text.code(role.managed)],
    ["Separado", V2Text.code(role.hoist)],
  ].filter(Boolean);

  return new ComponentsV2Builder({ color }).addSection(
    [V2Text.heading(role.name, 3, 100), V2Text.sectionBlock("Información", rows)],
    { thumbnail: roleIconUrl(role, 1024), fallbackToText: true }
  );
}

function buildRoleIconCard(role) {
  return buildImageCard({
    title: "Icono del rol",
    subtitle: role.name,
    imageUrl: role.iconURL({ size: 4096, extension: "png" }),
    color: role.color || DARK,
  });
}

function buildRoleColorCard(role) {
  const info = formatRoleColorInfo(role);
  const fields = [
    ["Estilo", V2Text.code(info.styleLabel)],
    ["Primario", `${V2Text.code(info.primaryHex ?? "#000000")} (${V2Text.code(info.primary)})`],
    info.secondaryHex ? ["Secundario", V2Text.code(info.secondaryHex)] : null,
    info.tertiaryHex ? ["Terciario", V2Text.code(info.tertiaryHex)] : null,
  ].filter(Boolean);

  return new ComponentsV2Builder({ color: info.primary || DARK }).addSection(
    [
      V2Text.heading(role.name, 3, 100),
      V2Text.fields(fields),
    ],
    { thumbnail: roleIconUrl(role, 1024), fallbackToText: true }
  );
}

function parseHexInt(raw) {
  if (raw === null || raw === undefined) return null;
  const match = String(raw).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  return Number.parseInt(match[1], 16);
}

function buildRoleListCard({ role, title, lines, pageIndex, totalPages, footer = null, controls = null }) {
  return buildListCard({
    title,
    lines,
    footer: footer ?? (totalPages > 1 ? `Página ${pageIndex + 1}/${totalPages}` : null),
    thumbnail: roleIconUrl(role),
    color: role.color || DARK,
    controls,
  });
}

function createMemberRoleCommand({ name, description, isAdd }) {
  return {
    data: new CommandBuilder({ name, description, guildOnly: true }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario objetivo", required: true })
      .addRole({ name: "rol", description: "Rol a gestionar", required: true }),
    plugins: MANAGE_ROLES_PLUGINS,
    async code(ctx) {
      await ctx.defer();
      const member = ctx.get("usuario");
      const role = ctx.get("rol");
      const modTag = ctx.user?.tag;

      if (!member?.roles?.cache) return ctx.ephemeral("No pude obtener al miembro en el servidor");

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.ephemeral(hierr);

      const hasRole = member.roles.cache.has(role.id);
      if (isAdd && hasRole) {
        return ctx.ephemeral(`${member} ya tiene el rol ${role}`);
      }
      if (!isAdd && !hasRole) {
        return ctx.ephemeral(`${member} no tiene el rol ${role}`);
      }

      try {
        if (isAdd) {
          await member.roles.add(role, `${modTag}: role add`);
        } else {
          await member.roles.remove(role, `${modTag}: role remove`);
        }

        const color = isAdd ? GREEN : RED;
        await ctx.send(
          buildActionCard({
            title: isAdd ? "Rol añadido" : "Rol removido",
            thumbnail: avatarUrl(member.user),
            fields: [
              ["Usuario", `${member}`],
              ["Rol", `${role}`],
            ],
            moderator: modTag,
            color,
          })
        );

        await logAction(ctx.guild, {
          title: isAdd ? "Rol añadido" : "Rol removido",
          color,
          fields: [
            { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true },
          ],
        });
      } catch (err) {
        return failWith(ctx, err, isAdd ? "No se pudo asignar el rol" : "No se pudo quitar el rol");
      }
    },
  };
}

function createRoleToggleCommand({ name, description, prop, setter, label, logTitle, errorMsg }) {
  return {
    data: new CommandBuilder({ name, description, guildOnly: true }),
    params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a modificar", required: true }),
    plugins: MANAGE_ROLES_PLUGINS,
    async code(ctx) {
      await ctx.defer();
      if (!ctx.guild) return noGuildReply(ctx);

      const role = ctx.get("rol");
      const modTag = ctx.user?.tag;

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.ephemeral(hierr);

      try {
        const nextVal = !role[prop];
        await role[setter](nextVal, `${modTag}: role ${name}`);

        const estado = nextVal ? "activado" : "desactivado";
        const color = nextVal ? GREEN : RED;

        await ctx.send(
          buildActionCard({
            title: `${label} ${estado}`,
            thumbnail: roleIconUrl(role),
            fields: [
              ["Rol", `${role}`],
              ["Estado", V2Text.code(estado)],
            ],
            moderator: modTag,
            color,
          })
        );

        await logAction(ctx.guild, {
          title: logTitle,
          color,
          fields: [
            { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true },
            { name: "Estado", value: estado, inline: true },
          ],
        });
      } catch (err) {
        return failWith(ctx, err, errorMsg);
      }
    },
  };
}

function createTargetBulkRoleCommand({ name, description, isBots, targetNoun, title }) {
  return {
    data: new CommandBuilder({ name, description, guildOnly: true }),
    params: new ParamsBuilder()
      .addRole({ name: "rol", description: "Rol a gestionar", required: true })
      .addString({
        name: "accion",
        description: "Acción a ejecutar (añadir o remover)",
        required: true,
        choices: [
          { name: "Añadir", value: "add" },
          { name: "Quitar", value: "remove" },
        ],
      }),
    plugins: ADMIN_ROLE_PLUGINS,
    async code(ctx) {
      await ctx.defer();
      const role = ctx.get("rol");
      const action = ctx.get("accion");
      if (action !== "add" && action !== "remove") return ctx.ephemeral("Acción inválida");
      const isAdd = action === "add";
      const modTag = ctx.user?.tag;

      return executeBulkRole({
        ctx,
        role,
        action: isAdd ? "add" : "remove",
        filterMember: (m) => (isBots ? m.user.bot : !m.user.bot) && (isAdd ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id)),
        emptyMessage: `No hay ${targetNoun} a los que ${isAdd ? "añadir" : "quitar"} el rol ${role}`,
        actionWord: isAdd ? "Añadiendo" : "Quitando",
        pastWord: isAdd ? "Añadidos" : "Quitados",
        title,
        color: isAdd ? GREEN : RED,
        modTag,
        extraLogFields: [{ name: "Acción", value: isAdd ? "Añadir" : "Quitar", inline: true }],
      });
    },
  };
}

const data = {
  data: new GroupBuilder({
    name: "role",
    description: "Información, asignación y gestión de roles",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "info", description: "Información general de un rol" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        if (!role) return ctx.ephemeral("No encontré ese rol");

        const authorId = ctx.user?.id;
        const navOptions = [
          { label: "Color", value: "color", description: "Color del rol" },
          { label: "Permisos", value: "permissions", description: "Permisos del rol" },
          { label: "Usuarios", value: "users", description: "Usuarios con este rol" },
          ...(role.icon ? [{ label: "Icono", value: "icon", description: "Icono del rol" }] : []),
        ];
        const allNavOptions = [{ label: "Info", value: "info", description: "Información del rol" }, ...navOptions];

        const perms = role.permissions.toArray().sort().map(formatPerm);
        const memberCounts = await ctx.guild.roles.fetchMemberCounts().catch(() => null);
        const roleMemberCount = memberCounts?.get?.(role.id) ?? null;
        let cachedUsers = null;
        const loadUsers = async () => {
          if (cachedUsers) return cachedUsers;
          if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
            await ctx.guild.members.fetch().catch(() => {});
          }
          const sortedMembers = role.members.sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0));
          cachedUsers = Array.from(sortedMembers.values()).map((m, i) => `${i + 1}. ${m}`);
          return cachedUsers;
        };

        const renderView = ({ state, view, isEnded }) => {
          let builder;
          if (state.tab === "color") {
            builder = buildRoleColorCard(role);
          } else if (state.tab === "icon") {
            builder = buildRoleIconCard(role);
          } else if (state.tab === "permissions" || state.tab === "users") {
            const items = state.tab === "permissions" ? perms : (cachedUsers ?? []);
            const sliced = slicePage(items, state.pageIndex, PAGE_SIZE);
            const controls = !isEnded && sliced.totalPages > 1
              ? [
                  { label: "◀", customId: view.id("page", "prev"), style: "secondary", disabled: sliced.pageIndex <= 0 },
                  { label: "▶", customId: view.id("page", "next"), style: "secondary", disabled: sliced.pageIndex >= sliced.totalPages - 1 },
                ]
              : null;

            builder = state.tab === "permissions"
              ? buildRoleListCard({
                  role,
                  title: `Permisos de ${role.name}`,
                  lines: sliced.items,
                  pageIndex: sliced.pageIndex,
                  totalPages: sliced.totalPages,
                  controls,
                })
              : buildRoleListCard({
                  role,
                  title: `Usuarios con ${role.name} (${sliced.pageIndex + 1}/${sliced.totalPages})`,
                  lines: sliced.items,
                  pageIndex: sliced.pageIndex,
                  totalPages: sliced.totalPages,
                  footer: `${items.length} usuarios en total`,
                  controls,
                });
          } else {
            builder = buildRoleInfoCard(role, roleMemberCount);
          }

          if (!isEnded) {
            builder.addSpacer("small").addSelectMenu({
              customId: view.id("select"),
              placeholder: "Navegar...",
              options: state.tab === "info" ? navOptions : allNavOptions,
            });
          }
          return builder;
        };

        const roleView = new V2View({
          authorId,
          timeout: 5 * 60 * 1000,
          thirdPartyMode: "ephemeral-view",
          onEnd: "static",
          state: { tab: "info", pageIndex: 0 },
          render: renderView,
          renderStatic: (args) => renderView({ ...args, isEnded: true }),
          actions: {
            select: async ({ values, interaction, setState }) => {
              const selected = values[0];
              if (!selected) return false;

              if (selected === "icon" && !role.icon) {
                await interaction.reply({ content: "Este rol no tiene icono", flags: MessageFlags.Ephemeral }).catch(() => {});
                return false;
              }
              if (selected === "color" && !formatRoleColorInfo(role).hasColor) {
                await interaction.reply({ content: "Sin color asignado", flags: MessageFlags.Ephemeral }).catch(() => {});
                return false;
              }
              if (selected === "permissions" && !perms.length) {
                await interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral }).catch(() => {});
                return false;
              }
              if (selected === "users") {
                const users = await loadUsers();
                if (!users.length) {
                  await interaction.reply({ content: "Nadie tiene este rol", flags: MessageFlags.Ephemeral }).catch(() => {});
                  return false;
                }
              }

              setState({ tab: selected, pageIndex: 0 });
            },
            page: ({ parts, state, setState }) => {
              const items = state.tab === "permissions" ? perms : (cachedUsers ?? []);
              const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
              const delta = parts[0] === "prev" ? -1 : 1;
              const next = Math.max(0, Math.min(totalPages - 1, state.pageIndex + delta));
              setState({ pageIndex: next });
            },
          },
        });

        await roleView.send(ctx);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "icon", description: "Icono de un rol en alta resolución" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        if (!role) return ctx.ephemeral("No encontré ese rol");
        if (!role.icon) return ctx.ephemeral("Este rol no tiene icono");

        await ctx.send(buildRoleIconCard(role));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "color", description: "Consulta o edita el color (sólido, degradado o holográfico) de un rol" }),
      params: new ParamsBuilder()
        .addRole({ name: "rol", description: "Rol a consultar o editar", required: true })
        .addString({ name: "primario", description: "Nuevo color hex primario para editar el rol (ej: #ff383d)", required: false })
        .addString({ name: "secundario", description: "Color hex secundario para estilo degradado (opcional)", required: false })
        .addString({
          name: "holografico",
          description: "Aplicar estilo holográfico oficial de Discord",
          required: false,
          choices: [{ name: "Sí (estilo holográfico)", value: "true" }],
        }),

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        if (!role) return ctx.ephemeral("No encontré ese rol");

        const rawPrimary = ctx.get("primario");
        const rawSecondary = ctx.get("secundario");
        const isHolo = ctx.get("holografico") === "true";

        if (!rawPrimary && !rawSecondary && !isHolo) {
          if (!formatRoleColorInfo(role).hasColor) return ctx.ephemeral("Este rol no tiene color asignado");
          return ctx.send(buildRoleColorCard(role));
        }

        if (ctx.member?.id !== ctx.guild.ownerId && !ctx.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
          return ctx.ephemeral("Necesitas el permiso **Administrar roles** (`ManageRoles`) para editar colores de rol");
        }
        const me = await fetchBotMember(ctx.guild);
        if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
          return ctx.ephemeral("Necesito el permiso **Administrar roles** (`ManageRoles`) para editar el color del rol");
        }

        const hierr = roleHierarchyCheck(ctx, role);
        if (hierr) return ctx.ephemeral(hierr);

        const wantsEnhanced = isHolo || Boolean(rawSecondary);
        if (wantsEnhanced && !ctx.guild.features?.includes?.(GuildFeature.EnhancedRoleColors)) {
          return ctx.ephemeral("Este servidor no tiene activado **Enhanced Role Styles** para colores degradados u holográficos.");
        }

        let colorsPayload;
        if (isHolo) {
          colorsPayload = {
            primaryColor: Constants.HolographicStyle.Primary,
            secondaryColor: Constants.HolographicStyle.Secondary,
            tertiaryColor: Constants.HolographicStyle.Tertiary,
          };
        } else {
          const primaryInt = rawPrimary ? parseHexInt(rawPrimary) : (role.colors?.primaryColor ?? role.color ?? null);
          if (primaryInt === null || !Number.isFinite(primaryInt)) {
            return ctx.ephemeral("Color hex primario inválido. Usa el formato `#ff383d`.");
          }
          if (rawSecondary) {
            if (!primaryInt || primaryInt <= 0) {
              return ctx.ephemeral("Indica también un color hex `primario` válido (ej: `#ff383d`) para crear el degradado.");
            }
            const secondaryInt = parseHexInt(rawSecondary);
            if (secondaryInt === null) {
              return ctx.ephemeral("Color hex secundario inválido. Usa el formato `#ff9900`.");
            }
            colorsPayload = { primaryColor: primaryInt, secondaryColor: secondaryInt };
          } else {
            colorsPayload = { primaryColor: primaryInt };
          }
        }

        try {
          const modTag = ctx.user?.tag;
          const updatedRole = await role.setColors(colorsPayload, `${modTag}: role color`);
          await ctx.send(buildRoleColorCard(updatedRole));

          const info = formatRoleColorInfo(updatedRole);
          await logAction(ctx.guild, {
            title: "Color de rol actualizado",
            color: info.primary || DARK,
            fields: [
              { name: "Rol", value: `${updatedRole.name} (\`${updatedRole.id}\`)`, inline: true },
              { name: "Moderador", value: modTag, inline: true },
              { name: "Estilo", value: info.display, inline: true },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudo actualizar el color del rol");
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "users", description: "Lista de miembros con un rol específico" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a consultar", required: true }),

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
          await ctx.guild.members.fetch().catch(() => {});
        }

        const role = ctx.get("rol");
        if (!role) return ctx.ephemeral("No encontré ese rol");

        const members = Array.from(role.members.values()).map((m, i) => `${i + 1}. ${m}`);
        if (!members.length) return ctx.ephemeral("Nadie tiene este rol");

        const authorId = ctx.user?.id;
        const paginator = createListPaginator({
          items: members,
          perPage: PAGE_SIZE,
          ownerId: authorId,
          render: ({ items: pageItems, pageIndex, totalPages, controls }) =>
            buildRoleListCard({
              role,
              title: `Usuarios con ${role.name} (${pageIndex + 1}/${totalPages})`,
              lines: pageItems,
              pageIndex,
              totalPages,
              footer: `${members.length} usuarios en total`,
              controls,
            }),
        });

        await paginator.send(ctx);
      },
    })
    .addCommand(createMemberRoleCommand({ name: "add", description: "Asigna un rol a un usuario", isAdd: true }))
    .addCommand(createMemberRoleCommand({ name: "remove", description: "Remueve un rol de un usuario", isAdd: false }))
    .addCommand({
      data: new CommandBuilder({
        name: "rename",
        description: "Modifica el nombre de un rol",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({ name: "rol", description: "Rol a modificar", required: true })
        .addString({ name: "nombre", description: "Nuevo nombre del rol", required: true }),
      plugins: MANAGE_ROLES_PLUGINS,

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        const newName = String(ctx.get("nombre") ?? "").trim().slice(0, 100);
        if (!newName) return ctx.ephemeral("Indica un nombre válido para el rol");
        const modTag = ctx.user?.tag;

        const hierr = roleHierarchyCheck(ctx, role);
        if (hierr) return ctx.ephemeral(hierr);

        try {
          const oldName = role.name;
          await role.setName(newName, `${modTag}: role rename`);

          await ctx.send(
            buildActionCard({
              title: "Rol renombrado",
              thumbnail: roleIconUrl(role),
              fields: [
                ["Rol", `${role}`],
                ["Antes", V2Text.code(oldName)],
                ["Ahora", V2Text.code(newName)],
              ],
              moderator: modTag,
              color: role.color || DARK,
            })
          );

          await logAction(ctx.guild, {
            title: "Rol renombrado",
            color: role.color || DARK,
            fields: [
              { name: "Rol", value: `\`${role.id}\``, inline: true },
              { name: "Moderador", value: modTag, inline: true },
              { name: "Antes", value: `\`${oldName}\``, inline: true },
              { name: "Ahora", value: `\`${newName}\``, inline: true },
            ],
          });
        } catch (err) {
          return failWith(ctx, err, "No se pudo renombrar el rol");
        }
      },
    })
    .addCommand(
      createRoleToggleCommand({
        name: "hoist",
        description: "Alterna si un rol se muestra separado en la lista (hoist)",
        prop: "hoist",
        setter: "setHoist",
        label: "Hoist",
        logTitle: "Hoist de rol actualizado",
        errorMsg: "No se pudo cambiar el hoist",
      })
    )
    .addCommand(
      createRoleToggleCommand({
        name: "mentionable",
        description: "Alterna si un rol es mencionable por todos",
        prop: "mentionable",
        setter: "setMentionable",
        label: "Mencionable",
        logTitle: "Mencionable de rol actualizado",
        errorMsg: "No se pudo cambiar la mencionabilidad",
      })
    )
    .addCommand({
      data: new CommandBuilder({
        name: "all",
        description: "Asigna un rol a todos los miembros del servidor",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({ name: "rol", description: "Rol a asignar", required: true })
        .addString({
          name: "incluir_bots",
          description: "Incluir bots (opcional)",
          required: false,
          choices: [
            { name: "Sí", value: "true" },
            { name: "No", value: "false" },
          ],
        }),
      plugins: ADMIN_ROLE_PLUGINS,

      async code(ctx) {
        await ctx.defer();
        const role = ctx.get("rol");
        const incluirBot = ctx.get("incluir_bots") === "true";
        const modTag = ctx.user?.tag;

        return executeBulkRole({
          ctx,
          role,
          action: "add",
          filterMember: (m) => !m.roles.cache.has(role.id) && (incluirBot ? true : !m.user.bot),
          emptyMessage: `Todos ${incluirBot ? "" : "los usuarios "}ya tienen el rol ${role}`,
          actionWord: "Añadiendo",
          pastWord: "Añadidos",
          title: "Role all",
          color: GREEN,
          modTag,
          extraLogFields: [{ name: "Bots", value: incluirBot ? "Sí" : "No", inline: true }],
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "removeall",
        description: "Remueve un rol de todos los miembros que lo tengan",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({ name: "rol", description: "Rol a remover", required: true })
        .addString({
          name: "incluir_bots",
          description: "Incluir bots (por defecto no)",
          required: false,
          choices: [
            { name: "Sí", value: "true" },
            { name: "No", value: "false" },
          ],
        }),
      plugins: ADMIN_ROLE_PLUGINS,

      async code(ctx) {
        await ctx.defer();
        const role = ctx.get("rol");
        const incluirBot = ctx.get("incluir_bots") === "true";
        const modTag = ctx.user?.tag;

        return executeBulkRole({
          ctx,
          role,
          action: "remove",
          filterMember: (m) => m.roles.cache.has(role.id) && (incluirBot ? true : !m.user.bot),
          emptyMessage: `Nadie ${incluirBot ? "" : "de los usuarios "}tiene el rol ${role}`,
          actionWord: "Quitando",
          pastWord: "Quitados",
          title: "Role removeall",
          color: RED,
          modTag,
          extraLogFields: [{ name: "Bots", value: incluirBot ? "Sí" : "No", inline: true }],
        });
      },
    })
    .addCommand(
      createTargetBulkRoleCommand({
        name: "bots",
        description: "Asigna o remueve un rol a todos los bots",
        isBots: true,
        targetNoun: "bots",
        title: "Role bots",
      })
    )
    .addCommand(
      createTargetBulkRoleCommand({
        name: "humans",
        description: "Asigna o remueve un rol a todos los humanos (sin bots)",
        isBots: false,
        targetNoun: "usuarios",
        title: "Role humans",
      })
    )
    .addCommand({
      data: new CommandBuilder({
        name: "join",
        description: "Configura o desactiva el rol automático al entrar (autorole)",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({
          name: "rol",
          description: "Rol automático al entrar (omitir para desactivar)",
          required: false,
        })
        .addString({
          name: "ignorar_bots",
          description: "Ignorar bots (opcional)",
          required: false,
          choices: [{ name: "Sí", value: "true" }],
        }),
      plugins: [Plugins.hasPerms("ManageGuild"), Plugins.hasBotPerms("ManageRoles")],

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);
        const role = ctx.get("rol");
        const ignoreBots = ctx.get("ignorar_bots") === "true";
        const modTag = ctx.user?.tag;

        if (!role) {
          const deleted = await JoinRole.findOneAndDelete({ guildId: ctx.guild.id });
          if (!deleted) {
            return ctx.ephemeral("No hay un rol automático configurado");
          }

          await ctx.send(
            buildActionCard({
              title: "Rol automático desactivado",
              description: "Ya no se asignará un rol automático al entrar",
              moderator: modTag,
              color: RED,
            })
          );

          return logAction(ctx.guild, {
            description: "Rol automático al entrar desactivado",
            color: RED,
          });
        }

        const hierr = roleHierarchyCheck(ctx, role);
        if (hierr) return ctx.ephemeral(hierr);

        await JoinRole.findOneAndUpdate(
          { guildId: ctx.guild.id },
          { roleId: role.id, ignoreBots },
          { upsert: true }
        );

        await ctx.send(
          buildActionCard({
            title: "Rol automático configurado",
            thumbnail: roleIconUrl(role),
            fields: [
              ["Rol", `${role}`],
              ["Ignorar bots", V2Text.code(ignoreBots ? "Sí" : "No")],
            ],
            moderator: modTag,
            color: GREEN,
          })
        );
        await logAction(ctx.guild, {
          title: "Rol join configurado",
          color: GREEN,
          fields: [
            { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
            { name: "Moderador", value: modTag, inline: true },
            { name: "Ignorar bots", value: ignoreBots ? "Sí" : "No", inline: true },
          ],
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "permissions",
        description: "Lista de permisos de un rol (globales o en un canal específico)",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({
          name: "rol",
          description: "Rol a consultar",
          required: true,
        })
        .addChannel({
          name: "canal",
          description: "Canal específico para ver permisos efectivos (opcional)",
          required: false,
        }),

      async code(ctx) {
        await ctx.defer();
        try {
          if (!ctx.guild) return noGuildReply(ctx);

          const role = ctx.get("rol");
          if (!role) return ctx.send("No pude encontrar el rol");

          const canal = ctx.get("canal") ?? null;
          if (canal) {
            const accessErr = checkTargetChannelAccess(ctx, canal, [], {
              crossGuildMsg: "No tengo acceso a ese canal",
              permMsg: "No tienes permisos para ver ese canal",
            });
            if (accessErr) return ctx.ephemeral(accessErr);
          }

          const invoker = ctx.user ?? ctx.member?.user;
          let perms = [];
          let maskedNote = null;

          if (canal) {
            const computed = await fetchComputedChannelPermissions({
              client: ctx.guild.client,
              channel: canal,
              targetType: "role",
              targetId: role.id,
              fallbackPerms: canal.permissionsFor?.(role) ?? null,
            });
            perms = computed.effectiveList.map(formatPerm);
            if (computed.maskedList.length) {
              const preview = computed.maskedList.slice(0, 3).map(formatPerm).join(", ");
              const extra = computed.maskedList.length > 3 ? ` +${computed.maskedList.length - 3}` : "";
              maskedNote = `⚠️ Enmascarados implícitamente (${computed.maskedList.length}): ${preview}${extra}`;
            }
            if (!perms.length && !maskedNote) return ctx.send(`Este rol no tiene permisos en ${canal}`);
            if (!perms.length) perms = ["*(Sin permisos efectivos en este canal)*"];
          } else {
            perms = role.permissions.toArray().sort().map(formatPerm);
            if (!perms.length) return ctx.send("Este rol no tiene permisos");
          }

          const title = canal ? `Permisos de ${role.name} en #${canal.name}` : `Permisos de ${role.name}`;
          const paginator = createListPaginator({
            items: perms,
            perPage: PAGE_SIZE,
            ownerId: invoker.id,
            render: ({ items: pageItems, pageIndex, totalPages, controls }) => {
              const pageFooter = totalPages > 1 ? `Página ${pageIndex + 1}/${totalPages}` : null;
              const combinedFooter = [pageFooter, maskedNote].filter(Boolean).join(" · ") || null;
              return buildRoleListCard({
                role,
                title,
                lines: pageItems,
                pageIndex,
                totalPages,
                footer: combinedFooter,
                controls,
              });
            },
          });

          await paginator.send(ctx);
        } catch (err) {
          log.error("Error en role permissions", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "reaction",
        description: "Paneles de roles por reacción o botón (normales, únicos o temporales)",
      }),
      params: new ParamsBuilder()
        .addString({
          name: "accion",
          description: "Acción sobre paneles de roles",
          required: true,
          choices: [
            { name: "Crear panel", value: "create" },
            { name: "Añadir rol al panel", value: "add" },
            { name: "Quitar rol del panel", value: "remove" },
            { name: "Publicar / actualizar panel", value: "send" },
            { name: "Listar paneles", value: "list" },
            { name: "Eliminar panel", value: "delete" },
          ],
        })
        .addString({ name: "panel_id", description: "Nombre corto del panel (ej: colores)", required: false })
        .addRole({ name: "rol", description: "Rol a vincular", required: false })
        .addString({ name: "emoji", description: "Emoji de reacción/botón (ej: 🔴)", required: false })
        .addString({ name: "etiqueta", description: "Texto del botón o título del panel", required: false })
        .addString({
          name: "modo",
          description: "Comportamiento del panel",
          required: false,
          choices: [
            { name: "Normal (poner/quitar)", value: "normal" },
            { name: "Único (solo 1 por panel)", value: "unique" },
            { name: "Verificación (solo poner)", value: "verify" },
            { name: "Temporal (expira tras tiempo)", value: "temp" },
          ],
        })
        .addString({ name: "duracion", description: "Duración si es temporal (ej: 2h, 1d)", required: false })
        .addChannel({ name: "canal", description: "Canal donde publicar el panel", required: false }),
      plugins: MANAGE_ROLES_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const action = ctx.get("accion");
        const panelId = String(ctx.get("panel_id") ?? "").trim().toLowerCase().slice(0, 32);

        if (action === "list") {
          const panels = await ReactionRolePanel.find({ guildId: ctx.guild.id }).lean();
          if (!panels.length) return ctx.ephemeral("No hay paneles de roles por reacción creados");
          const totalRoles = panels.reduce((acc, p) => acc + (p.entries?.length ?? 0), 0);
          return ctx.send(ComponentsV2Builder.card({
            title: `Paneles de roles (${panels.length}/${MAX_PANELS_PER_GUILD} · ${totalRoles}/${MAX_ROLES_PER_GUILD} roles)`,
            description: panels.map((p) => `• \`${p.panelId}\` (**${p.mode}**) — ${p.entries?.length ?? 0} roles`).join("\n"),
            color: RED,
          }));
        }

        if (!panelId) return ctx.ephemeral("Debes indicar `panel_id`");

        if (action === "delete") {
          const res = await ReactionRolePanel.deleteOne({ guildId: ctx.guild.id, panelId });
          if (!res.deletedCount) return ctx.ephemeral("No encontré ese panel");
          return ctx.send(ComponentsV2Builder.card({ title: "Panel eliminado", description: `Se borró \`${panelId}\`.`, color: RED }));
        }

        if (action === "create") {
          const existingPanel = await ReactionRolePanel.findOne({ guildId: ctx.guild.id, panelId }).lean();
          if (!existingPanel) {
            const count = await ReactionRolePanel.countDocuments({ guildId: ctx.guild.id });
            if (count >= MAX_PANELS_PER_GUILD) return ctx.ephemeral(`Alcanzaste el límite de ${MAX_PANELS_PER_GUILD} paneles`);
          }
          const mode = ctx.get("modo") || "normal";
          const durationMs = mode === "temp" ? parseDuration(ctx.get("duracion") || "1h") : null;
          if (mode === "temp" && (!durationMs || durationMs < 60_000)) {
            return ctx.ephemeral("Indica una duración válida para roles temporales (ej: `30m`, `2h`)");
          }
          await ReactionRolePanel.findOneAndUpdate(
            { guildId: ctx.guild.id, panelId },
            {
              $set: {
                channelId: (ctx.get("canal") ?? ctx.channel).id,
                title: String(ctx.get("etiqueta") || `Roles: ${panelId}`).slice(0, 200),
                mode,
                durationMs,
              },
              $setOnInsert: { entries: [] },
            },
            { upsert: true, returnDocument: "after" }
          );
          return ctx.send(ComponentsV2Builder.card({
            title: "Panel creado",
            description: `Panel \`${panelId}\` creado en modo **${mode}**. Añade roles con \`/role reaction accion:add\` y publícalo con \`send\`.`,
            color: GREEN,
          }));
        }

        const panel = await ReactionRolePanel.findOne({ guildId: ctx.guild.id, panelId });
        if (!panel) return ctx.ephemeral("Primero crea el panel con `accion:create`");

        if (action === "add") {
          const role = ctx.get("rol");
          const hierr = roleHierarchyCheck(ctx, role);
          if (hierr) return ctx.ephemeral(hierr);

          if (panel.entries.some((e) => e.roleId === role.id)) {
            return ctx.ephemeral("Ese rol ya está en el panel");
          }

          const rawEmoji = String(ctx.get("emoji") ?? "").trim() || null;
          if (rawEmoji && !isValidMenuEmoji(rawEmoji)) {
            return ctx.ephemeral("Emoji inválido");
          }

          const allPanels = await ReactionRolePanel.find({ guildId: ctx.guild.id }).select("entries").lean();
          const totalRoles = allPanels.reduce((acc, p) => acc + (p.entries?.length ?? 0), 0);
          if (totalRoles >= MAX_ROLES_PER_GUILD) {
            return ctx.ephemeral(`Alcanzaste el límite de ${MAX_ROLES_PER_GUILD} roles por reacción en el servidor`);
          }
          if (panel.entries.length >= 25) return ctx.ephemeral("Cada panel admite hasta 25 botones/reacciones");

          const key = `r_${Date.now().toString(36)}_${panel.entries.length}`;
          panel.entries.push({
            key,
            emoji: rawEmoji,
            label: String(ctx.get("etiqueta") || role.name).slice(0, 80),
            roleId: role.id,
          });
          await panel.save();
          return ctx.send(ComponentsV2Builder.card({
            title: "Rol añadido al panel",
            description: `${role} añadido a \`${panelId}\` (${panel.entries.length}/25). Usa \`accion:send\` para publicarlo.`,
            color: GREEN,
          }));
        }

        if (action === "remove") {
          const role = ctx.get("rol");
          if (!role) return ctx.ephemeral("Indica el rol a quitar");
          panel.entries = panel.entries.filter((e) => e.roleId !== role.id);
          await panel.save();
          return ctx.send(ComponentsV2Builder.card({ title: "Rol quitado del panel", description: `Se quitó ${role} de \`${panelId}\`.`, color: RED }));
        }

        if (action === "send") {
          if (!panel.entries.length) return ctx.ephemeral("Añade al menos un rol al panel antes de publicarlo");
          const targetCh = ctx.get("canal") ?? ctx.guild.channels.cache.get(panel.channelId) ?? ctx.channel;
          if (!targetCh?.isTextBased?.()) return ctx.ephemeral("Canal inválido");
          await ctx.defer({ ephemeral: true });
          const sent = await targetCh.send(buildReactionRolePanelPayload(panel));
          panel.channelId = targetCh.id;
          panel.messageId = sent.id;
          await panel.save();
          for (const entry of panel.entries) {
            if (entry.emoji) await sent.react(entry.emoji).catch(() => {});
          }
          return ctx.ephemeral(`Panel \`${panelId}\` publicado en ${targetCh}`);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "voicelink",
        description: "Asigna y quita un rol automáticamente al entrar o salir de canales de voz",
      }),
      params: new ParamsBuilder()
        .addString({
          name: "accion",
          description: "Acción",
          required: true,
          choices: [{ name: "Vincular", value: "add" }, { name: "Desvincular", value: "remove" }, { name: "Listar", value: "list" }],
        })
        .addRole({ name: "rol", description: "Rol a otorgar en voz", required: false })
        .addChannel({ name: "canal_voz", description: "Canal de voz específico (omitir para cualquiera)", required: false }),
      plugins: MANAGE_ROLES_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const action = ctx.get("accion");
        if (!["add", "remove", "list"].includes(action)) {
          return ctx.ephemeral("Acción inválida");
        }

        if (action === "list") {
          const list = await VoiceLink.find({ guildId: ctx.guild.id, targetType: "role" }).lean();
          if (!list.length) return ctx.ephemeral("No hay vínculos voz-rol configurados");
          return ctx.send(ComponentsV2Builder.card({
            title: "Voice-Role Links",
            description: list.map((l) => `• ${l.voiceChannelId === "any" ? "`Cualquier canal de voz`" : `<#${l.voiceChannelId}>`} → <@&${l.targetId}>`).join("\n"),
            color: RED,
          }));
        }

        const role = ctx.get("rol");
        const hierr = roleHierarchyCheck(ctx, role);
        if (hierr) return ctx.ephemeral(hierr);

        const vch = ctx.get("canal_voz");
        if (vch && vch.type !== ChannelType.GuildVoice) return ctx.ephemeral("El canal debe ser de voz");
        const voiceChannelId = vch?.id ?? "any";

        if (action === "remove") {
          await VoiceLink.deleteOne({ guildId: ctx.guild.id, voiceChannelId, targetType: "role", targetId: role.id });
          return ctx.send(ComponentsV2Builder.card({ title: "Vínculo eliminado", description: `Se quitó el vínculo de voz para ${role}.`, color: RED }));
        }

        await VoiceLink.findOneAndUpdate(
          { guildId: ctx.guild.id, voiceChannelId, targetType: "role", targetId: role.id },
          { $setOnInsert: { guildId: ctx.guild.id } },
          { upsert: true, returnDocument: "after" }
        );
        await ctx.send(ComponentsV2Builder.card({
          title: "Voice-Role Link activado",
          description: `Quien entre a ${vch ? vch : "**cualquier canal de voz**"} recibirá ${role} temporalmente.`,
          color: GREEN,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "temprole",
        description: "Asigna un rol temporal a un usuario que se quita solo al expirar",
      }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario objetivo", required: true })
        .addRole({ name: "rol", description: "Rol temporal", required: true })
        .addString({ name: "duracion", description: "Duración (ej: 30m, 2h, 7d)", required: true }),
      plugins: MANAGE_ROLES_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const member = ctx.get("usuario");
        const role = ctx.get("rol");
        if (!member?.roles?.cache) return ctx.ephemeral("No pude obtener al miembro en el servidor");
        const hierr = roleHierarchyCheck(ctx, role);
        if (hierr) return ctx.ephemeral(hierr);

        const ms = parseDuration(ctx.get("duracion"));
        if (!ms || ms < 60_000 || ms > 365 * 86_400_000) {
          return ctx.ephemeral("Indica una duración válida entre `1m` y `365d`");
        }
        const expiresAt = await grantTempRole({
          client: ctx.bot ?? ctx.guild.client,
          guild: ctx.guild,
          member,
          role,
          durationMs: ms,
          source: ctx.user.tag,
        });
        const ts = Math.floor(expiresAt.getTime() / 1000);
        await ctx.send(buildActionCard({
          title: "Rol temporal asignado",
          fields: [
            ["Usuario", `${member}`],
            ["Rol", `${role}`],
            ["Expira", `<t:${ts}:R> (${formatDuration(ms)})`],
          ],
          moderator: ctx.user.tag,
          color: GREEN,
        }));
      },
    }),
};

module.exports = { data };
