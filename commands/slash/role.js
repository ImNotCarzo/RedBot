const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const {
  ActionRowBuilder,
  EmbedBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const {
  Logger,
  clampPage,
  paginateArray,
  noGuildReply,
  formatPermissionName: formatPerm,
  uniqueId,
  handleCommandError,
  failWith,
} = require("../../src/runtime");
const {
  createContainer,
  addHeaderSection,
  addSeparator,
  clipV2Text,
  buildSimpleContainer,
  buildImageViewContainer,
  buildPaginatedListContainer,
  buildV2Payload,
} = require("../../src/v2");
const { JoinRole } = require("../../src/database");
const { sendLog } = require("../../src/guild");
const { RED, GREEN, DARK } = require("../../src/config");

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
  if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

  const lockKey = `${guild.id}:${role.id}`;
  if (activeRoleOps.has(lockKey)) {
    return ctx.send({ content: "Ya hay una operación masiva ejecutándose para este rol en este servidor.", flags: MessageFlags.Ephemeral });
  }
  activeRoleOps.add(lockKey);

  try {
    if (guild.memberCount !== guild.members.cache.size) {
      await guild.members.fetch().catch(() => {});
    }

    const targets = guild.members.cache.filter(filterMember);
    if (!targets.size) {
      return ctx.send({ content: emptyMessage, flags: MessageFlags.Ephemeral });
    }

    const total = targets.size;
    const progressEmbed = (current) =>
      new EmbedBuilder()
        .setDescription(`${actionWord} ${role} a **${current}/${total}** miembros...`)
        .setColor(color);

    const msg = await ctx.send({ embeds: [progressEmbed(0)] });

    let done = 0;
    let failed = 0;
    let consecutiveFails = 0;

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
        await msg.edit({ embeds: [progressEmbed(processed)] }).catch(() => {});
      }
    }

    const finalEmbed = new EmbedBuilder()
      .setTitle(`${title} completado${consecutiveFails >= 10 ? " (interrumpido por errores)" : ""}`)
      .setColor(color)
      .addFields(
        { name: "Rol", value: `${role}`, inline: true },
        { name: pastWord, value: `${done}`, inline: true },
        { name: "Fallidos", value: `${failed}`, inline: true }
      )
      .setTimestamp();

    await msg.edit({ embeds: [finalEmbed] }).catch(() => {});

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

function buildRoleInfoPayload(role, { extraRows = [], ephemeral = false } = {}) {
  const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "Sin color";
  const color = role.color || DARK;
  const infoLines =
    `> **ID:** \`${role.id}\`\n` +
    `> **Color:** \`${hex}\`\n` +
    `> **Posición:** \`${role.position}\`\n` +
    `> **Mencionable:** \`${role.mentionable}\`\n` +
    `> **Gestionado:** \`${role.managed}\`\n` +
    `> **Separado:** \`${role.hoist}\``;

  const container = createContainer(color);
  addHeaderSection(
    container,
    [`### ${clipV2Text(role.name, 100)}`, `**Información**\n${infoLines}`],
    role.icon ? role.iconURL({ size: 1024 }) : null
  );

  if (extraRows.length) {
    addSeparator(container, SeparatorSpacingSize.Small, false);
    for (const row of extraRows) {
      if (row) container.addActionRowComponents(row);
    }
  }

  return buildV2Payload(container, { ephemeral });
}

function buildRoleIconPayload(role, { extraRows = [], ephemeral = false } = {}) {
  const url = role.iconURL({ size: 4096, extension: "png" });
  return buildV2Payload(
    buildImageViewContainer({
      authorName: role.name,
      title: "Icono del rol",
      imageUrl: url,
      color: role.color || DARK,
      extraRows,
    }),
    { ephemeral }
  );
}

function buildRoleColorPayload(role, { extraRows = [], ephemeral = false } = {}) {
  const hex = `#${role.color.toString(16).padStart(6, "0")}`;
  const container = createContainer(role.color);
  addHeaderSection(
    container,
    [
      `### ${clipV2Text(role.name, 100)}`,
      `> **Hex:** \`${hex}\`\n> **Decimal:** \`${role.color}\``,
    ],
    role.icon ? role.iconURL({ size: 1024 }) : null
  );

  if (extraRows.length) {
    addSeparator(container, SeparatorSpacingSize.Small, false);
    for (const row of extraRows) {
      if (row) container.addActionRowComponents(row);
    }
  }

  return buildV2Payload(container, { ephemeral });
}

function buildRolePermsPayload(role, pages, page, { prevId = null, nextId = null, extraRows = [], interactive = true, ephemeral = false } = {}) {
  const container = buildPaginatedListContainer({
    title: `Permisos de ${role.name}`,
    lines: pages[page],
    footer: pages.length > 1 ? `Página ${page + 1}/${pages.length}` : null,
    thumbnailUrl: role.icon ? role.iconURL({ size: 256 }) : null,
    color: role.color || DARK,
    page,
    totalPages: pages.length,
    prevId,
    nextId,
    extraRows,
    interactive,
  });
  return buildV2Payload(container, { ephemeral });
}

function buildRoleUsersPayload(role, totalUsers, pages, page, { prevId = null, nextId = null, extraRows = [], interactive = true, ephemeral = false } = {}) {
  const container = buildPaginatedListContainer({
    title: `Usuarios con ${role.name} (${page + 1}/${pages.length})`,
    lines: pages[page],
    footer: `${totalUsers} usuarios en total`,
    thumbnailUrl: role.icon ? role.iconURL({ size: 256 }) : null,
    color: role.color || DARK,
    page,
    totalPages: pages.length,
    prevId,
    nextId,
    extraRows,
    interactive,
  });
  return buildV2Payload(container, { ephemeral });
}

function createMemberRoleCommand({ name, description, isAdd }) {
  return {
    data: new CommandBuilder({ name, description, guildOnly: true }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario", required: true })
      .addRole({ name: "rol", description: "Rol", required: true }),
    plugins: MANAGE_ROLES_PLUGINS,
    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      const member = ctx.get("usuario");
      const role = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

      const hasRole = member.roles.cache.has(role.id);
      if (isAdd && hasRole) {
        return ctx.send({ content: `${member} ya tiene el rol ${role}`, flags: MessageFlags.Ephemeral });
      }
      if (!isAdd && !hasRole) {
        return ctx.send({ content: `${member} no tiene el rol ${role}`, flags: MessageFlags.Ephemeral });
      }

      try {
        if (isAdd) {
          await member.roles.add(role, `${modTag}: role add`);
        } else {
          await member.roles.remove(role, `${modTag}: role remove`);
        }

        const color = isAdd ? GREEN : RED;
        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setDescription(isAdd ? `${role} fue añadido a ${member}` : `${role} fue removido de ${member}`)
              .setColor(color)
              .setTimestamp(),
          ],
        });

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
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);

      const role = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

      try {
        const nextVal = !role[prop];
        await role[setter](nextVal, `${modTag}: role ${name}`);

        const estado = nextVal ? "activado" : "desactivado";
        const color = nextVal ? GREEN : RED;

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setDescription(`${label} de **${role.name}** ${estado}`)
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
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      const role = ctx.get("rol");
      const isAdd = ctx.get("accion") === "add";
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

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
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });

        const authorId = ctx.user?.id ?? ctx.author?.id;

        const navOptions = [
          { label: "Color", value: "color", description: "Color del rol" },
          { label: "Permisos", value: "permissions", description: "Permisos del rol" },
          { label: "Usuarios", value: "users", description: "Usuarios con este rol" },
          ...(role.icon ? [{ label: "Icono", value: "icon", description: "Icono del rol" }] : []),
        ];
        const allNavOptions = [{ label: "Info", value: "info", description: "Información del rol" }, ...navOptions];

        const navId = uniqueId("role_nav");
        const prevId = uniqueId("role_prev");
        const nextId = uniqueId("role_next");

        const buildNavRow = (includeInfo) =>
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(navId)
              .setPlaceholder("Navegar...")
              .addOptions((includeInfo ? allNavOptions : navOptions).map((o) =>
                new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description)
              ))
          );

        let renderCurrent = (interactive = true) =>
          buildRoleInfoPayload(role, { extraRows: interactive ? [buildNavRow(false)] : [] });

        const msg = await ctx.send(renderCurrent(true));

        let subCollector = null;

        const attachPageCollector = (renderPage, pages) => {
          let page = 0;
          renderCurrent = (interactive = true, includePag = true) =>
            renderPage(page, {
              extraRows: interactive ? [buildNavRow(true)] : [],
              interactive: interactive && includePag,
            });

          subCollector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60 * 1000,
            filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
          });
          subCollector.on("collect", async (i) => {
            page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
            await i.update(renderCurrent(true, true));
          });
          subCollector.on("end", (_c, reason) => {
            if (reason === "time") {
              renderCurrent = (interactive = true) =>
                renderPage(page, {
                  extraRows: interactive ? [buildNavRow(true)] : [],
                  interactive: false,
                });
              msg.edit(renderCurrent(true)).catch(() => {});
            }
          });
        };

        const collector = msg.createMessageComponentCollector({
          time: 5 * 60 * 1000,
          filter: (i) => i.customId === navId || [prevId, nextId].includes(i.customId),
        });

        collector.on("collect", async (interaction) => {
          const isAuthor = interaction.user.id === authorId;

          if ([prevId, nextId].includes(interaction.customId)) {
            if (!isAuthor) return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
            return;
          }

          const selected = interaction.values?.[0];
          if (!selected) return;

          if (!isAuthor) {
            if (selected === "info") {
              return interaction.reply(buildRoleInfoPayload(role, { ephemeral: true }));
            }
            if (selected === "icon") {
              if (!role.icon) return interaction.reply({ content: "Este rol no tiene icono", flags: MessageFlags.Ephemeral });
              return interaction.reply(buildRoleIconPayload(role, { ephemeral: true }));
            }
            if (selected === "color") {
              if (!role.color) return interaction.reply({ content: "Sin color asignado", flags: MessageFlags.Ephemeral });
              return interaction.reply(buildRoleColorPayload(role, { ephemeral: true }));
            }
            if (selected === "permissions") {
              const perms = role.permissions.toArray().sort().map(formatPerm);
              if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });
              return interaction.reply(
                buildV2Payload(
                  buildSimpleContainer({
                    title: `Permisos de ${role.name}`,
                    body: perms.join("\n"),
                    thumbnailUrl: role.icon ? role.iconURL({ size: 256 }) : null,
                    color: role.color || DARK,
                  }),
                  { ephemeral: true }
                )
              );
            }
            if (selected === "users") {
              if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
                await ctx.guild.members.fetch().catch(() => {});
              }
              const members = Array.from(role.members.values()).map((m, i) => `${i + 1}. ${m}`);
              if (!members.length) return interaction.reply({ content: "Nadie tiene este rol", flags: MessageFlags.Ephemeral });
              return interaction.reply(
                buildV2Payload(
                  buildSimpleContainer({
                    title: `Usuarios con ${role.name}`,
                    body: members.slice(0, 15).join("\n"),
                    thumbnailUrl: role.icon ? role.iconURL({ size: 256 }) : null,
                    color: role.color || DARK,
                  }),
                  { ephemeral: true }
                )
              );
            }
            return interaction.reply({ content: "No puedes interactuar con esto", flags: MessageFlags.Ephemeral });
          }

          if (subCollector) { subCollector.stop(); subCollector = null; }

          if (selected === "info") {
            renderCurrent = (interactive = true) =>
              buildRoleInfoPayload(role, { extraRows: interactive ? [buildNavRow(false)] : [] });
            return interaction.update(renderCurrent(true));
          }

          if (selected === "icon") {
            if (!role.icon) return interaction.reply({ content: "Este rol no tiene icono", flags: MessageFlags.Ephemeral });
            renderCurrent = (interactive = true) =>
              buildRoleIconPayload(role, { extraRows: interactive ? [buildNavRow(true)] : [] });
            return interaction.update(renderCurrent(true));
          }

          if (selected === "color") {
            if (!role.color) return interaction.reply({ content: "Sin color asignado", flags: MessageFlags.Ephemeral });
            renderCurrent = (interactive = true) =>
              buildRoleColorPayload(role, { extraRows: interactive ? [buildNavRow(true)] : [] });
            return interaction.update(renderCurrent(true));
          }

          if (selected === "permissions") {
            const perms = role.permissions.toArray().sort().map(formatPerm);
            if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });

            const pages = paginateArray(perms, 15);
            const renderPerms = (pg, opts) => buildRolePermsPayload(role, pages, pg, { prevId, nextId, ...opts });
            renderCurrent = (interactive = true) =>
              renderPerms(0, { extraRows: interactive ? [buildNavRow(true)] : [], interactive: false });

            await interaction.update(
              renderPerms(0, { extraRows: [buildNavRow(true)], interactive: pages.length > 1 })
            );

            if (pages.length > 1) attachPageCollector(renderPerms, pages);
            return;
          }

          if (selected === "users") {
            if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
              await ctx.guild.members.fetch().catch(() => {});
            }
            const sortedMembers = role.members.sort((a, b) => (b.joinedTimestamp ?? 0) - (a.joinedTimestamp ?? 0));
            if (!sortedMembers.size) return interaction.reply({ content: "Nadie tiene este rol", flags: MessageFlags.Ephemeral });

            const numberedMembers = Array.from(sortedMembers.values()).map((m, i) => `${i + 1}. ${m}`);
            const pages = paginateArray(numberedMembers, 15);
            const renderUsers = (pg, opts) =>
              buildRoleUsersPayload(role, sortedMembers.size, pages, pg, { prevId, nextId, ...opts });
            renderCurrent = (interactive = true) =>
              renderUsers(0, { extraRows: interactive ? [buildNavRow(true)] : [], interactive: false });

            await interaction.update(
              renderUsers(0, { extraRows: [buildNavRow(true)], interactive: pages.length > 1 })
            );

            if (pages.length > 1) attachPageCollector(renderUsers, pages);
          }
        });

        collector.on("end", (_c, reason) => {
          if (subCollector) subCollector.stop();
          if (reason === "time") msg.edit(renderCurrent(false)).catch(() => {});
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "icon", description: "Muestra el icono de un rol" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });
        if (!role.icon) return ctx.send({ content: "Este rol no tiene icono", flags: MessageFlags.Ephemeral });

        await ctx.send(buildRoleIconPayload(role));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "color", description: "Muestra el color de un rol" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });
        if (!role.color) return ctx.send({ content: "Este rol no tiene color asignado", flags: MessageFlags.Ephemeral });

        await ctx.send(buildRoleColorPayload(role));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "users", description: "Lista usuarios con un rol" }),
      params: new ParamsBuilder().addRole({ name: "rol", description: "Rol", required: true }),

      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);

        if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
          await ctx.guild.members.fetch().catch(() => {});
        }

        const role = ctx.get("rol");
        if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });

        const members = Array.from(role.members.values()).map((m, i) => `${i + 1}. ${m}`);
        if (!members.length) return ctx.send({ content: "Nadie tiene este rol", flags: MessageFlags.Ephemeral });

        const pages = paginateArray(members, 15);
        let page = 0;

        const authorId = ctx.user?.id ?? ctx.author?.id;
        const prevId = uniqueId("role_users_prev");
        const nextId = uniqueId("role_users_next");

        const msg = await ctx.send(
          buildRoleUsersPayload(role, members.length, pages, page, { prevId, nextId, interactive: true })
        );

        if (pages.length <= 1) return;

        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60 * 1000,
          filter: (i) => [prevId, nextId].includes(i.customId),
        });

        collector.on("collect", async (i) => {
          if (i.user.id !== authorId) return i.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
          if (i.customId === prevId) page--;
          if (i.customId === nextId) page++;
          page = clampPage(page, pages.length);
          await i.update(buildRoleUsersPayload(role, members.length, pages, page, { prevId, nextId, interactive: true }));
        });

        collector.on("end", (_c, reason) => {
          if (reason === "time") {
            msg.edit(buildRoleUsersPayload(role, members.length, pages, page, { interactive: false })).catch(() => {});
          }
        });
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
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);

        const role = ctx.get("rol");
        const newName = ctx.get("nombre").slice(0, 100);
        const modTag = ctx.user?.tag ?? ctx.author?.tag;

        const hierr = roleHierarchyCheck(ctx, role);
        if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

        try {
          const oldName = role.name;
          await role.setName(newName, `${modTag}: role rename`);

          await ctx.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("Rol renombrado")
                .setColor(role.color || DARK)
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
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        const role = ctx.get("rol");
        const incluirBot = ctx.get("incluir_bots") === "true";
        const modTag = ctx.user?.tag ?? ctx.author?.tag;

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
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        const role = ctx.get("rol");
        const incluirBot = ctx.get("incluir_bots") === "true";
        const modTag = ctx.user?.tag ?? ctx.author?.tag;

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
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        if (!ctx.guild) return noGuildReply(ctx);
        const role = ctx.get("rol");
        const ignoreBots = ctx.get("ignorar_bots") === "true";
        const modTag = ctx.user?.tag ?? ctx.author?.tag;

        if (!role) {
          const deleted = await JoinRole.findOneAndDelete({ guildId: ctx.guild.id });
          if (!deleted) {
            return ctx.send({ content: "No hay un rol automático configurado", flags: MessageFlags.Ephemeral });
          }

          const embed = new EmbedBuilder()
            .setDescription("Rol automático al entrar desactivado")
            .setColor(RED)
            .setTimestamp();

          await ctx.send({ embeds: [embed] });
          return sendLog(ctx.guild, embed);
        }

        const hierr = roleHierarchyCheck(ctx, role);
        if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

        await JoinRole.findOneAndUpdate(
          { guildId: ctx.guild.id },
          { roleId: role.id, ignoreBots },
          { upsert: true }
        );

        const embed = new EmbedBuilder()
          .setTitle("Rol automático configurado")
          .setDescription(`${role} se asignará a cada usuario que entre al servidor`)
          .setColor(GREEN)
          .addFields({ name: "Ignorar bots", value: ignoreBots ? "Sí" : "No", inline: true })
          .setTimestamp();

        await ctx.send({ embeds: [embed] });
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
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          if (!ctx.guild) return noGuildReply(ctx);

          const role = ctx.get("rol");
          if (!role) return ctx.send("No pude encontrar el rol");

          const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
          const perms = role.permissions.toArray().sort().map(formatPerm);
          if (!perms.length) return ctx.send("Este rol no tiene permisos");

          const pages = paginateArray(perms, 15);
          let page = 0;

          const prevId = uniqueId("role_perms_prev");
          const nextId = uniqueId("role_perms_next");

          const reply = await ctx.send(
            buildRolePermsPayload(role, pages, page, { prevId, nextId, interactive: true })
          );

          if (pages.length <= 1) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60 * 1000,
            filter: (i) => [prevId, nextId].includes(i.customId),
          });

          collector.on("collect", async (i) => {
            if (i.user.id !== invoker.id) {
              return i.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
            }

            if (i.customId === prevId) page--;
            if (i.customId === nextId) page++;
            page = clampPage(page, pages.length);

            await i.update(
              buildRolePermsPayload(role, pages, page, { prevId, nextId, interactive: true })
            );
          });

          collector.on("end", (_c, reason) => {
            if (reason === "time") {
              reply.edit(buildRolePermsPayload(role, pages, page, { interactive: false })).catch(() => {});
            }
          });
        } catch (err) {
          log.error("Error en role permissions", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    }),
};

module.exports = { data };
