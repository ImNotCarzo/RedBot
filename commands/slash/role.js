const {
  GroupBuilder,
  CommandBuilder,
  ParamsBuilder,
  Plugins,
  ComponentsV2Builder,
  MessageFlags,
  V2Text,
  V2View,
  V2Paginator,
} = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const {
  Logger,
  noGuildReply,
  formatPermissionName: formatPerm,
  handleCommandError,
  buildActionCard,
  failWith,
} = require("../../src/runtime");
const { JoinRole } = require("../../src/database");
const { sendLog } = require("../../src/guild");
const { RED, GREEN, DARK } = require("../../src/config");

const PAGE_SIZE = 15;

const log = new Logger("CMD_ROLE", process.env.LOG_LEVEL);

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

      await new Promise((r) => setTimeout(r, 1100));

      const processed = done + failed;
      if (processed % 10 === 0 || processed === total) {
        await msg.edit(buildProgressCard(processed).toPayload()).catch(() => {});
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

    await msg.edit(finalCard.toPayload()).catch(() => {});

    const logEmbed = new EmbedBuilder()
      .setTitle(`${title} ejecutado`)
      .setColor(color)
      .addFields(
        { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "Moderador", value: modTag, inline: true },
        { name: pastWord, value: `${done}`, inline: true },
        { name: "Fallidos", value: `${failed}`, inline: true },
        ...extraLogFields
      )
      .setTimestamp();

    await sendLog(guild, logEmbed).catch(() => {});
  } finally {
    activeRoleOps.delete(lockKey);
  }
}

function buildRoleInfoCard(role) {
  const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "Sin color";
  const color = role.color || DARK;
  const rows = [
    ["ID", V2Text.code(role.id)],
    ["Color", V2Text.code(hex)],
    ["Posición", V2Text.code(role.position)],
    ["Mencionable", V2Text.code(role.mentionable)],
    ["Gestionado", V2Text.code(role.managed)],
    ["Separado", V2Text.code(role.hoist)],
  ];

  return new ComponentsV2Builder({ color }).addSection(
    [V2Text.heading(role.name, 3, 100), V2Text.sectionBlock("Información", rows)],
    { thumbnail: role.icon ? role.iconURL({ size: 1024 }) : null, fallbackToText: true }
  );
}

function buildRoleIconCard(role) {
  const url = role.iconURL({ size: 4096, extension: "png" });
  return new ComponentsV2Builder({ color: role.color || DARK })
    .addText(`${V2Text.subtext(role.name, 120)}\n${V2Text.heading("Icono del rol", 3)}`)
    .addGallery(url)
    .addSpacer("small")
    .addButton({ label: "Abrir imagen", style: "link", url });
}

function buildRoleColorCard(role) {
  const hex = `#${role.color.toString(16).padStart(6, "0")}`;
  return new ComponentsV2Builder({ color: role.color }).addSection(
    [
      V2Text.heading(role.name, 3, 100),
      V2Text.fields([
        ["Hex", V2Text.code(hex)],
        ["Decimal", V2Text.code(role.color)],
      ]),
    ],
    { thumbnail: role.icon ? role.iconURL({ size: 1024 }) : null, fallbackToText: true }
  );
}

function buildRoleListCard({ role, title, lines, pageIndex, totalPages, footer = null, controls = null }) {
  const builder = new ComponentsV2Builder({ color: role.color || DARK })
    .addSection(
      [V2Text.heading(title, 3, 200)],
      { thumbnail: role.icon ? role.iconURL({ size: 256 }) : null, fallbackToText: true }
    )
    .addSeparator("small")
    .addText(V2Text.clip(lines.join("\n"), 3600));

  const resolvedFooter = footer ?? (totalPages > 1 ? `Página ${pageIndex + 1}/${totalPages}` : null);
  if (resolvedFooter) builder.addText(V2Text.subtext(resolvedFooter, 200));
  if (controls?.length) builder.addSpacer("small").addButtonsRow(controls);
  return builder;
}

function createMemberRoleCommand({ name, description, isAdd }) {
  return {
    data: new CommandBuilder({ name, description, guildOnly: true }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario", required: true })
      .addRole({ name: "rol", description: "Rol", required: true }),
    plugins: MANAGE_ROLES_PLUGINS,
    async code(ctx) {
      await ctx.defer();
      const member = ctx.get("usuario");
      const role = ctx.get("rol");
      const modTag = ctx.user?.tag;

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
            thumbnail: member.user?.displayAvatarURL?.({ size: 256 }) ?? null,
            fields: [
              ["Usuario", `${member}`],
              ["Rol", `${role}`],
            ],
            moderator: modTag,
            color,
          })
        );

        await sendLog(
          ctx.guild,
          new EmbedBuilder()
            .setTitle(isAdd ? "Rol añadido" : "Rol removido")
            .setColor(color)
            .addFields(
              { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
              { name: "Moderador", value: modTag, inline: true },
            )
            .setTimestamp()
        );
      } catch (err) {
        return failWith(ctx, err, isAdd ? "No se pudo asignar el rol" : "No se pudo quitar el rol");
      }
    },
  };
}

function createRoleToggleCommand({ name, description, prop, setter, label, logTitle, errorMsg }) {
  return {
    data: new CommandBuilder({ name, description, guildOnly: true }),
    params: new ParamsBuilder().addRole({ name: "rol", description: "Rol", required: true }),
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
            thumbnail: role.icon ? role.iconURL({ size: 256 }) : null,
            fields: [
              ["Rol", `${role}`],
              ["Estado", V2Text.code(estado)],
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
              { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
              { name: "Moderador", value: modTag, inline: true },
              { name: "Estado", value: estado, inline: true },
            )
            .setTimestamp()
        );
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
        description: "¿Añadir o quitar?",
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
      const isAdd = ctx.get("accion") === "add";
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
    description: "Comandos relacionados con roles",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "info", description: "Muestra información de un rol" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        if (!role) return ctx.ephemeral("No encontré ese rol");

        const authorId = ctx.user?.id ?? ctx.author?.id;
        const navOptions = [
          { label: "Color", value: "color", description: "Color del rol" },
          { label: "Permisos", value: "permissions", description: "Permisos del rol" },
          { label: "Usuarios", value: "users", description: "Usuarios con este rol" },
          ...(role.icon ? [{ label: "Icono", value: "icon", description: "Icono del rol" }] : []),
        ];
        const allNavOptions = [{ label: "Info", value: "info", description: "Información del rol" }, ...navOptions];

        const perms = role.permissions.toArray().sort().map(formatPerm);
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
            const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
            const safePage = Math.max(0, Math.min(totalPages - 1, state.pageIndex));
            const pageItems = items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
            const controls = !isEnded && totalPages > 1
              ? [
                  { label: "◀", customId: view.id("page", "prev"), style: "secondary", disabled: safePage <= 0 },
                  { label: "▶", customId: view.id("page", "next"), style: "secondary", disabled: safePage >= totalPages - 1 },
                ]
              : null;

            builder = state.tab === "permissions"
              ? buildRoleListCard({
                  role,
                  title: `Permisos de ${role.name}`,
                  lines: pageItems,
                  pageIndex: safePage,
                  totalPages,
                  controls,
                })
              : buildRoleListCard({
                  role,
                  title: `Usuarios con ${role.name} (${safePage + 1}/${totalPages})`,
                  lines: pageItems,
                  pageIndex: safePage,
                  totalPages,
                  footer: `${items.length} usuarios en total`,
                  controls,
                });
          } else {
            builder = buildRoleInfoCard(role);
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
              if (selected === "color" && !role.color) {
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
      data: new CommandBuilder({ name: "icon", description: "Muestra el icono de un rol" }),
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
      data: new CommandBuilder({ name: "color", description: "Muestra el color de un rol" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        if (!role) return ctx.ephemeral("No encontré ese rol");
        if (!role.color) return ctx.ephemeral("Este rol no tiene color asignado");

        await ctx.send(buildRoleColorCard(role));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "users", description: "Lista usuarios con un rol" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol", required: true }),

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

        const authorId = ctx.user?.id ?? ctx.author?.id;
        const paginator = new V2Paginator({
          items: members,
          perPage: PAGE_SIZE,
          ownerId: authorId,
          thirdPartyMode: "reject",
          thirdPartyMessage: "No es tu comando",
          wrap: false,
          prevButton: { label: "◀" },
          nextButton: { label: "▶" },
          showPageIndicator: false,
          timeout: 2 * 60 * 1000,
          renderPage: ({ items: pageItems, pageIndex, totalPages, isEnded, controls }) =>
            buildRoleListCard({
              role,
              title: `Usuarios con ${role.name} (${pageIndex + 1}/${totalPages})`,
              lines: pageItems,
              pageIndex,
              totalPages,
              footer: `${members.length} usuarios en total`,
              controls: !isEnded && totalPages > 1 ? controls : null,
            }),
        });

        await paginator.send(ctx);
      },
    })
    .addCommand(createMemberRoleCommand({ name: "add", description: "Añade un rol a un usuario", isAdd: true }))
    .addCommand(createMemberRoleCommand({ name: "remove", description: "Quita un rol a un usuario", isAdd: false }))
    .addCommand({
      data: new CommandBuilder({
        name: "rename",
        description: "Renombra un rol",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({ name: "rol", description: "Rol a renombrar", required: true })
        .addString({ name: "nombre", description: "Nombre nuevo", required: true }),
      plugins: MANAGE_ROLES_PLUGINS,

      async code(ctx) {
        await ctx.defer();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        const newName = ctx.get("nombre").slice(0, 100);
        const modTag = ctx.user?.tag;

        const hierr = roleHierarchyCheck(ctx, role);
        if (hierr) return ctx.ephemeral(hierr);

        try {
          const oldName = role.name;
          await role.setName(newName, `${modTag}: role rename`);

          await ctx.send(
            buildActionCard({
              title: "Rol renombrado",
              thumbnail: role.icon ? role.iconURL({ size: 256 }) : null,
              fields: [
                ["Rol", `${role}`],
                ["Antes", V2Text.code(oldName)],
                ["Ahora", V2Text.code(newName)],
              ],
              moderator: modTag,
              color: role.color || DARK,
            })
          );

          await sendLog(
            ctx.guild,
            new EmbedBuilder()
              .setTitle("Rol renombrado")
              .setColor(role.color || DARK)
              .addFields(
                { name: "Rol", value: `\`${role.id}\``, inline: true },
                { name: "Moderador", value: modTag, inline: true },
                { name: "Antes", value: `\`${oldName}\``, inline: true },
                { name: "Ahora", value: `\`${newName}\``, inline: true },
              )
              .setTimestamp()
          );
        } catch (err) {
          return failWith(ctx, err, "No se pudo renombrar el rol");
        }
      },
    })
    .addCommand(
      createRoleToggleCommand({
        name: "hoist",
        description: "Activa o desactiva si un rol se muestra separado en la lista",
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
        description: "Activa o desactiva si un rol es mencionable por todos",
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
        description: "Añade un rol a todos los miembros del servidor",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({ name: "rol", description: "Rol a añadir", required: true })
        .addString({
          name: "incluir_bots",
          description: "¿Incluir bots?",
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
        description: "Quita un rol a todos los miembros que lo tengan",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({ name: "rol", description: "Rol a quitar", required: true })
        .addString({
          name: "incluir_bots",
          description: "¿Incluir bots? (por defecto no)",
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
        description: "Añade o quita un rol a todos los bots del servidor",
        isBots: true,
        targetNoun: "bots",
        title: "Role bots",
      })
    )
    .addCommand(
      createTargetBulkRoleCommand({
        name: "humans",
        description: "Añade o quita un rol a todos los usuarios (sin bots)",
        isBots: false,
        targetNoun: "usuarios",
        title: "Role humans",
      })
    )
    .addCommand({
      data: new CommandBuilder({
        name: "join",
        description: "Configura o desactiva el rol automático al entrar al servidor",
        guildOnly: true,
      }),
      params: new ParamsBuilder()
        .addRole({
          name: "rol",
          description: "Rol a asignar al entrar (omitir para desactivar)",
          required: false,
        })
        .addString({
          name: "ignorar_bots",
          description: "¿Ignorar bots?",
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

          const embed = new EmbedBuilder()
            .setDescription("Rol automático al entrar desactivado")
            .setColor(RED)
            .setTimestamp();

          return sendLog(ctx.guild, embed);
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
            thumbnail: role.icon ? role.iconURL({ size: 256 }) : null,
            fields: [
              ["Rol", `${role}`],
              ["Ignorar bots", V2Text.code(ignoreBots ? "Sí" : "No")],
            ],
            moderator: modTag,
            color: GREEN,
          })
        );
        await sendLog(
          ctx.guild,
          new EmbedBuilder()
            .setTitle("Rol join configurado")
            .setColor(GREEN)
            .addFields(
              { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
              { name: "Moderador", value: modTag, inline: true },
              { name: "Ignorar bots", value: ignoreBots ? "Sí" : "No", inline: true },
            )
            .setTimestamp()
        );
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "permissions",
        description: "Muestra los permisos de un rol",
        guildOnly: true,
      }),
      params: new ParamsBuilder().addRole({
        name: "rol",
        description: "Selecciona un rol",
        required: true,
      }),

      async code(ctx) {
        await ctx.defer();
        try {
          if (!ctx.guild) return noGuildReply(ctx);

          const role = ctx.get("rol");
          if (!role) return ctx.send("No pude encontrar el rol");

          const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
          const perms = role.permissions.toArray().sort().map(formatPerm);
          if (!perms.length) return ctx.send("Este rol no tiene permisos");

          const paginator = new V2Paginator({
            items: perms,
            perPage: PAGE_SIZE,
            ownerId: invoker.id,
            thirdPartyMode: "reject",
            thirdPartyMessage: "No es tu comando",
            wrap: false,
            prevButton: { label: "◀" },
            nextButton: { label: "▶" },
            showPageIndicator: false,
            timeout: 2 * 60 * 1000,
            renderPage: ({ items: pageItems, pageIndex, totalPages, isEnded, controls }) =>
              buildRoleListCard({
                role,
                title: `Permisos de ${role.name}`,
                lines: pageItems,
                pageIndex,
                totalPages,
                controls: !isEnded && totalPages > 1 ? controls : null,
              }),
          });

          await paginator.send(ctx);
        } catch (err) {
          log.error("Error en role permissions", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    }),
};

module.exports = { data };
