const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const { createCommandLogger, clampPage, noGuildReply, buildPagRow, buildPaginationRow, formatPermissionName: formatPerm, uniqueId, handleCommandError, failWith } = require("../_shared/runtime");
const JoinRole = require("../../models/JoinRole");
const { sendLog } = require("../../src/guild");
 
// ─────────────────────────────────────────────
//  SHARED LOG SCHEMA
// ─────────────────────────────────────────────
 
const { RED, GREEN, DARK } = require("../../utils/colors");
const log = createCommandLogger("CMD_ROLE");
 
// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function roleHierarchyCheck(ctx, role) {
  if (!ctx.guild) return "Este comando solo funciona en servidores";
  if (!role) return "Rol no encontrado";
  if (role.managed) return "No puedo editar roles gestionados por integraciones";
  if (role.id === ctx.guild.id) return "No puedo editar el rol @everyone";
  const botMember = ctx.guild.members.me ?? ctx.guild.members.cache.get(ctx.client?.user?.id ?? ctx.bot?.user?.id);
  const botHighest = botMember?.roles?.highest?.position ?? 0;
  if (role.position >= botHighest)
    return "No puedo actuar sobre ese rol porque está por encima del mío";
  const isOwner = ctx.member?.id === ctx.guild.ownerId;
  if (!isOwner) {
    const userHighest = ctx.member?.roles?.highest?.position ?? -1;
    if (userHighest === -1 || role.position >= userHighest)
      return "No puedes gestionar un rol con igual o mayor posición que tu rol más alto";
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
 
// Embed base de info sin permisos
function buildRoleInfoEmbed(role) {
  const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "Sin color";
  const embed = new EmbedBuilder()
    .setTitle(role.name)
    .setColor(role.color || DARK)
    .addFields({
      name: "Información",
      value:
        `> **ID:** \`${role.id}\`\n` +
        `> **Color:** \`${hex}\`\n` +
        `> **Posición:** \`${role.position}\`\n` +
        `> **Mencionable:** \`${role.mentionable}\`\n` +
        `> **Gestionado:** \`${role.managed}\`\n` +
        `> **Separado:** \`${role.hoist}\``,
    })
    .setTimestamp();
  if (role.icon) embed.setThumbnail(role.iconURL({ size: 1024 }));
  return embed;
}
 
// ─────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────
 
const data = {
  data: new GroupBuilder({
    name: "role",
    description: "Comandos relacionados con roles",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
 
  // ── INFO ──────────────────────────────────────
  .addCommand({
  data: new CommandBuilder({ name: "info", description: "Muestra información de un rol" }),
  params: new ParamsBuilder().addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

  async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
    if (!ctx.guild) return noGuildReply(ctx);

    const role = ctx.get("rol");
    if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });

    const authorId = ctx.user?.id ?? ctx.author?.id;
    const color = role.color || DARK;

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
          .addOptions((includeInfo ? allNavOptions : navOptions).map(o =>
            new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description)
          ))
      );

    const msg = await ctx.send({ embeds: [buildRoleInfoEmbed(role)], components: [buildNavRow(false)] });

    let subCollector = null;

    const collector = msg.createMessageComponentCollector({
      time: 5 * 60 * 1000,
      filter: i => i.customId === navId || [prevId, nextId].includes(i.customId),
    });

    collector.on("collect", async interaction => {
      const isAuthor = interaction.user.id === authorId;

      if ([prevId, nextId].includes(interaction.customId)) {
        if (!isAuthor) return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
        return;
      }

      const selected = interaction.values?.[0];
      if (!selected) return;
      if (subCollector) { subCollector.stop(); subCollector = null; }

      if (!isAuthor) {
        if (selected === "info") {
          return interaction.reply({ embeds: [buildRoleInfoEmbed(role)], flags: MessageFlags.Ephemeral });
        }
        if (selected === "icon") {
          if (!role.icon) return interaction.reply({ content: "Este rol no tiene icono", flags: MessageFlags.Ephemeral });
          const url = role.iconURL({ size: 4096, extension: "png" });
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle("Icono del rol").setURL(url).setImage(url).setColor(color).setTimestamp()], flags: MessageFlags.Ephemeral });
        }
        if (selected === "color") {
          if (!role.color) return interaction.reply({ content: "Sin color asignado", flags: MessageFlags.Ephemeral });
          const hex = `#${role.color.toString(16).padStart(6, "0")}`;
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle(role.name).setDescription(`> **Hex:** \`${hex}\`\n> **Decimal:** \`${role.color}\``).setColor(role.color).setTimestamp()], flags: MessageFlags.Ephemeral });
        }
        if (selected === "permissions") {
          const perms = role.permissions.toArray().sort().map(formatPerm);
          if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Permisos de ${role.name}`).setDescription(perms.join("\n")).setColor(color).setTimestamp()], flags: MessageFlags.Ephemeral });
        }
        if (selected === "users") {
          if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
            await ctx.guild.members.fetch().catch(() => {});
          }
          const members = role.members.map((m, i) => `${i + 1}. ${m}`);
          if (!members.length) return interaction.reply({ content: "Nadie tiene este rol", flags: MessageFlags.Ephemeral });
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Usuarios con ${role.name}`).setDescription(members.slice(0, 15).join("\n")).setColor(color).setTimestamp()], flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({ content: "No puedes interactuar con esto", flags: MessageFlags.Ephemeral });
      }

      if (selected === "info") {
        return interaction.update({ embeds: [buildRoleInfoEmbed(role)], components: [buildNavRow(false)] });
      }

      if (selected === "icon") {
        if (!role.icon) return interaction.reply({ content: "Este rol no tiene icono", flags: MessageFlags.Ephemeral });
        const url = role.iconURL({ size: 4096, extension: "png" });
        return interaction.update({
          embeds: [new EmbedBuilder().setAuthor({ name: role.name }).setTitle("Icono del rol").setURL(url).setImage(url).setColor(color).setTimestamp()],
          components: [buildNavRow(true)],
        });
      }

      if (selected === "color") {
        if (!role.color) return interaction.reply({ content: "Sin color asignado", flags: MessageFlags.Ephemeral });
        const hex = `#${role.color.toString(16).padStart(6, "0")}`;
        return interaction.update({
          embeds: [new EmbedBuilder().setTitle(role.name).setDescription(`> **Hex:** \`${hex}\`\n> **Decimal:** \`${role.color}\``).setColor(role.color).setTimestamp()],
          components: [buildNavRow(true)],
        });
      }

      if (selected === "permissions") {
        const perms = role.permissions.toArray().sort().map(formatPerm);
        if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });

        const pages = [];
        for (let i = 0; i < perms.length; i += 15) pages.push(perms.slice(i, i + 15));
        let page = 0;

        const buildPermsEmbed = (pg) => new EmbedBuilder()
          .setTitle(`Permisos de ${role.name}`)
          .setDescription(pages[pg].join("\n"))
          .setColor(color)
          .setTimestamp();

        await interaction.update({
          embeds: [buildPermsEmbed(page)],
          components: pages.length > 1 ? [buildNavRow(true), buildPagRow(prevId, nextId, page, pages.length)] : [buildNavRow(true)],
        });

        if (pages.length <= 1) return;

        subCollector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60 * 1000,
          filter: i => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
        });

        subCollector.on("collect", async i => {
          if (i.customId === prevId) page--;
          if (i.customId === nextId) page++;
          page = clampPage(page, pages.length);
          await i.update({ embeds: [buildPermsEmbed(page)], components: [buildNavRow(true), buildPagRow(prevId, nextId, page, pages.length)] });
        });
        return;
      }

      if (selected === "users") {
        if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
          await ctx.guild.members.fetch().catch(() => {});
        }
        const sortedMembers = role.members.sort((a, b) => b.joinedTimestamp - a.joinedTimestamp);

        if (!sortedMembers.size) return interaction.reply({ content: "Nadie tiene este rol", flags: MessageFlags.Ephemeral });

        const pages = [];
        for (let i = 0; i < sortedMembers.size; i += 15) {
          const slice = Array.from(sortedMembers.values()).slice(i, i + 15);
          pages.push(slice.map((m, index) => `${i + index + 1}. ${m}`));
        }

        let page = 0;

        const buildUsersEmbed = (pg) => new EmbedBuilder()
          .setTitle(`Usuarios con ${role.name} (${pg + 1}/${pages.length})`)
          .setDescription(pages[pg].join("\n"))
          .setColor(color)
          .setFooter({ text: `${sortedMembers.size} usuarios en total` })
          .setTimestamp();

        await interaction.update({
          embeds: [buildUsersEmbed(page)],
          components: pages.length > 1 ? [buildNavRow(true), buildPagRow(prevId, nextId, page, pages.length)] : [buildNavRow(true)],
        });

        if (pages.length <= 1) return;

        subCollector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 2 * 60 * 1000,
          filter: i => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
        });

        subCollector.on("collect", async i => {
          if (i.customId === prevId) page--;
          if (i.customId === nextId) page++;
          page = clampPage(page, pages.length);
          await i.update({ embeds: [buildUsersEmbed(page)], components: [buildNavRow(true), buildPagRow(prevId, nextId, page, pages.length)] });
        });
      }
    });

    collector.on("end", () => {
      if (subCollector) subCollector.stop();
      msg.edit({ components: [] }).catch(() => {});
    });
  },
})
    
  // ── ICON ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "icon",
      description: "Muestra el icono de un rol",
    }),
    params: new ParamsBuilder()
      .addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);

      const role = ctx.get("rol");
      if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });
      if (!role.icon) return ctx.send({ content: "Este rol no tiene icono", flags: MessageFlags.Ephemeral });

      const url = role.iconURL({ size: 4096, extension: "png" });

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: role.name })
            .setTitle("Icono del rol")
            .setURL(url)
            .setImage(url)
            .setColor(role.color || DARK)
            .setTimestamp(),
        ],
      });
    },
  })

  // ── COLOR ─────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "color",
      description: "Muestra el color de un rol",
    }),
    params: new ParamsBuilder()
      .addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);

      const role = ctx.get("rol");
      if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });
      if (!role.color) return ctx.send({ content: "Este rol no tiene color asignado", flags: MessageFlags.Ephemeral });

      const hex = `#${role.color.toString(16).padStart(6, "0")}`;

      const embed = new EmbedBuilder()
        .setTitle(role.name)
        .setDescription(`> **Hex:** \`${hex}\`\n> **Decimal:** \`${role.color}\``)
        .setColor(role.color)
        .setTimestamp();

      if (role.icon) embed.setThumbnail(role.iconURL({ size: 1024 }));
      await ctx.send({ embeds: [embed] });
    },
  })

  // ── USERS ─────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "users",
      description: "Lista usuarios con un rol",
    }),
    params: new ParamsBuilder()
      .addRole({ name: "rol", description: "Rol", required: true }),

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);

      if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
        await ctx.guild.members.fetch().catch(() => {});
      }

      const role = ctx.get("rol");
      if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });

      const members = role.members.map(m => m.toString());
      if (!members.length) return ctx.send({ content: "Nadie tiene este rol", flags: MessageFlags.Ephemeral });

      const pages = [];
      for (let i = 0; i < members.length; i += 15) pages.push(members.slice(i, i + 15));
      let page = 0;

      const authorId = ctx.user?.id ?? ctx.author?.id;
      const prevId = uniqueId("role_users_prev");
      const nextId = uniqueId("role_users_next");

      const buildEmbed = () => new EmbedBuilder()
        .setTitle(`Usuarios con ${role.name} (${page + 1}/${pages.length})`)
        .setDescription(pages[page].map((u, i) => `${page * 15 + i + 1}. ${u}`).join("\n"))
        .setColor(role.color || DARK)
        .setFooter({ text: `${members.length} usuarios en total` })
        .setTimestamp();

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
        page = clampPage(page, pages.length);
        await i.update({ embeds: [buildEmbed()], components: [buildPagRow(prevId, nextId, page, pages.length)] });
      });

      collector.on("end", () => msg.edit({ components: [] }).catch(() => {}));
    },
  })

  // ── ADD ───────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "add",
      description: "Añade un rol a un usuario",
      guildOnly: true,
    }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario",  required: true })
      .addRole({   name: "rol",     description: "Rol",       required: true }),
    plugins: [Plugins.hasPerms("ManageRoles"), Plugins.hasBotPerms("ManageRoles")],

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      const member = ctx.get("usuario");
      const role   = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

      if (member.roles.cache.has(role.id))
        return ctx.send({ content: `${member} ya tiene el rol ${role}`, flags: MessageFlags.Ephemeral });

      try {
        await member.roles.add(role, `${modTag}: role add`);

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${role} fue añadido a ${member}`)
          .setColor(GREEN)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Rol añadido")
          .setColor(GREEN)
          .addFields(
            { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Rol",       value: `${role.name} (\`${role.id}\`)`,         inline: true },
            { name: "Moderador", value: modTag,                                   inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch (err) {
        return failWith(ctx, err, "No se pudo asignar el rol");
      }
    },
  })

  // ── REMOVE ────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "remove",
      description: "Quita un rol a un usuario",
      guildOnly: true,
    }),
    params: new ParamsBuilder()
      .addMember({ name: "usuario", description: "Usuario", required: true })
      .addRole({   name: "rol",     description: "Rol",      required: true }),

    plugins: [Plugins.hasPerms("ManageRoles"), Plugins.hasBotPerms("ManageRoles")],

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      const member = ctx.get("usuario");
      const role   = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

      if (!member.roles.cache.has(role.id))
        return ctx.send({ content: `${member} no tiene el rol ${role}`, flags: MessageFlags.Ephemeral });

      try {
        await member.roles.remove(role, `${modTag}: role remove`);

        const publicEmbed = new EmbedBuilder()
          .setDescription(`${role} fue removido de ${member}`)
          .setColor(RED)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Rol removido")
          .setColor(RED)
          .addFields(
            { name: "Usuario",   value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: "Rol",       value: `${role.name} (\`${role.id}\`)`,         inline: true },
            { name: "Moderador", value: modTag,                                   inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch (err) {
        return failWith(ctx, err, "No se pudo quitar el rol");
      }
    },
  })

  // ── RENAME ────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "rename",
      description: "Renombra un rol",
      guildOnly: true,
    }),
    params: new ParamsBuilder()
      .addRole({   name: "rol",    description: "Rol a renombrar", required: true })
      .addString({ name: "nombre", description: "Nombre nuevo",    required: true }),

    plugins: [Plugins.hasPerms("ManageRoles"), Plugins.hasBotPerms("ManageRoles")],

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);

      const role    = ctx.get("rol");
      const newName = ctx.get("nombre").slice(0, 100);
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

      try {
        const oldName = role.name;
        await role.setName(newName, `${modTag}: role rename`);

        const publicEmbed = new EmbedBuilder()
          .setTitle("Rol renombrado")
          .setColor(role.color || DARK)
          .addFields(
            { name: "Antes", value: `\`${oldName}\``, inline: true },
            { name: "Ahora", value: `\`${newName}\``, inline: true },
          )
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Rol renombrado")
          .setColor(role.color || DARK)
          .addFields(
            { name: "Rol",       value: `\`${role.id}\``,  inline: true },
            { name: "Moderador", value: modTag,             inline: true },
            { name: "Antes",     value: `\`${oldName}\``,  inline: true },
            { name: "Ahora",     value: `\`${newName}\``,  inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch (err) {
        return failWith(ctx, err, "No se pudo renombrar el rol");
      }
    },
  })

  // ── HOIST ─────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "hoist",
      description: "Activa o desactiva si un rol se muestra separado en la lista",
      guildOnly: true,
    }),
    params: new ParamsBuilder()
      .addRole({ name: "rol", description: "Rol", required: true }),

    plugins: [Plugins.hasPerms("ManageRoles"), Plugins.hasBotPerms("ManageRoles")],

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);

      const role   = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

      try {
        const newHoist = !role.hoist;
        await role.setHoist(newHoist, `${modTag}: role hoist`);

        const estado = newHoist ? "activado" : "desactivado";

        const publicEmbed = new EmbedBuilder()
          .setDescription(`Hoist de **${role.name}** ${estado}`)
          .setColor(newHoist ? GREEN : RED)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Hoist de rol actualizado")
          .setColor(newHoist ? GREEN : RED)
          .addFields(
            { name: "Rol",       value: `${role.name} (\`${role.id}\`)`, inline: true },
            { name: "Moderador", value: modTag,                           inline: true },
            { name: "Estado",    value: estado,                           inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch (err) {
        return failWith(ctx, err, "No se pudo cambiar el hoist");
      }
    },
  })

  // ── MENTIONABLE ───────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "mentionable",
      description: "Activa o desactiva si un rol es mencionable por todos",
      guildOnly: true,
    }),
    params: new ParamsBuilder()
      .addRole({ name: "rol", description: "Rol", required: true }),

    plugins: [Plugins.hasPerms("ManageRoles"), Plugins.hasBotPerms("ManageRoles")],

    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      if (!ctx.guild) return noGuildReply(ctx);

      const role   = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      const hierr = roleHierarchyCheck(ctx, role);
      if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

      try {
        const newMentionable = !role.mentionable;
        await role.setMentionable(newMentionable, `${modTag}: role mentionable`);

        const estado = newMentionable ? "activado" : "desactivado";

        const publicEmbed = new EmbedBuilder()
          .setDescription(`Mencionable de **${role.name}** ${estado}`)
          .setColor(newMentionable ? GREEN : RED)
          .setTimestamp();

        await ctx.send({ embeds: [publicEmbed] });

        const logEmbed = new EmbedBuilder()
          .setTitle("Mencionable de rol actualizado")
          .setColor(newMentionable ? GREEN : RED)
          .addFields(
            { name: "Rol",       value: `${role.name} (\`${role.id}\`)`, inline: true },
            { name: "Moderador", value: modTag,                           inline: true },
            { name: "Estado",    value: estado,                           inline: true },
          )
          .setTimestamp();

        await sendLog(ctx.guild, logEmbed);
      } catch (err) {
        return failWith(ctx, err, "No se pudo cambiar la mencionabilidad");
      }
    },
  })
  
  // ── ROLE ALL ──────────────────────────────────
.addCommand({
  data: new CommandBuilder({
    name: "all",
    description: "Añade un rol a todos los miembros del servidor",
    guildOnly: true,
  }),
  params: new ParamsBuilder()
    .addRole({
      name: "rol",
      description: "Rol a añadir",
      required: true,
    })
    .addString({
      name: "incluir_bots",
      description: "¿Incluir bots?",
      required: false,
      choices: [
        { name: "Sí", value: "true" },
        { name: "No", value: "false" },
      ],
    }),

  plugins: [Plugins.hasPerms("Administrator"), Plugins.hasBotPerms("ManageRoles")],

  async code(ctx) {
    if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
    const role       = ctx.get("rol");
    const incluirBot = ctx.get("incluir_bots") === "true";
    const modTag     = ctx.user?.tag ?? ctx.author?.tag;

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

// ── ROLE REMOVEALL ────────────────────────────
.addCommand({
  data: new CommandBuilder({
    name: "removeall",
    description: "Quita un rol a todos los miembros que lo tengan",
    guildOnly: true,
  }),
  params: new ParamsBuilder()
    .addRole({
      name: "rol",
      description: "Rol a quitar",
      required: true,
    })
    .addString({
      name: "incluir_bots",
      description: "¿Incluir bots? (por defecto no)",
      required: false,
      choices: [
        { name: "Sí", value: "true" },
        { name: "No", value: "false" },
      ],
    }),

  plugins: [Plugins.hasPerms("Administrator"), Plugins.hasBotPerms("ManageRoles")],

  async code(ctx) {
    if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
    const role       = ctx.get("rol");
    const incluirBot = ctx.get("incluir_bots") === "true";
    const modTag     = ctx.user?.tag ?? ctx.author?.tag;

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

// ── ROLE BOTS ─────────────────────────────────
.addCommand({
  data: new CommandBuilder({
    name: "bots",
    description: "Añade o quita un rol a todos los bots del servidor",
    guildOnly: true,
  }),
  params: new ParamsBuilder()
    .addRole({
      name: "rol",
      description: "Rol a gestionar",
      required: true,
    })
    .addString({
      name: "accion",
      description: "¿Añadir o quitar?",
      required: true,
      choices: [
        { name: "Añadir", value: "add" },
        { name: "Quitar", value: "remove" },
      ],
    }),

  plugins: [Plugins.hasPerms("Administrator"), Plugins.hasBotPerms("ManageRoles")],

  async code(ctx) {
    if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
    const role   = ctx.get("rol");
    const accion = ctx.get("accion");
    const isAdd  = accion === "add";
    const modTag = ctx.user?.tag ?? ctx.author?.tag;

    return executeBulkRole({
      ctx,
      role,
      action: isAdd ? "add" : "remove",
      filterMember: (m) => m.user.bot && (isAdd ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id)),
      emptyMessage: `No hay bots a los que ${isAdd ? "añadir" : "quitar"} el rol ${role}`,
      actionWord: isAdd ? "Añadiendo" : "Quitando",
      pastWord: isAdd ? "Añadidos" : "Quitados",
      title: "Role bots",
      color: isAdd ? GREEN : RED,
      modTag,
      extraLogFields: [{ name: "Acción", value: isAdd ? "Añadir" : "Quitar", inline: true }],
    });
  },
})

// ── ROLE HUMANS ───────────────────────────────
.addCommand({
  data: new CommandBuilder({
    name: "humans",
    description: "Añade o quita un rol a todos los usuarios (sin bots)",
    guildOnly: true,
  }),
  params: new ParamsBuilder()
    .addRole({
      name: "rol",
      description: "Rol a gestionar",
      required: true,
    })
    .addString({
      name: "accion",
      description: "¿Añadir o quitar?",
      required: true,
      choices: [
        { name: "Añadir", value: "add" },
        { name: "Quitar", value: "remove" },
      ],
    }),

  plugins: [Plugins.hasPerms("Administrator"), Plugins.hasBotPerms("ManageRoles")],

  async code(ctx) {
    if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
    const role   = ctx.get("rol");
    const accion = ctx.get("accion");
    const isAdd  = accion === "add";
    const modTag = ctx.user?.tag ?? ctx.author?.tag;

    return executeBulkRole({
      ctx,
      role,
      action: isAdd ? "add" : "remove",
      filterMember: (m) => !m.user.bot && (isAdd ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id)),
      emptyMessage: `No hay usuarios a los que ${isAdd ? "añadir" : "quitar"} el rol ${role}`,
      actionWord: isAdd ? "Añadiendo" : "Quitando",
      pastWord: isAdd ? "Añadidos" : "Quitados",
      title: "Role humans",
      color: isAdd ? GREEN : RED,
      modTag,
      extraLogFields: [{ name: "Acción", value: isAdd ? "Añadir" : "Quitar", inline: true }],
    });
  },
})

// ── ROLE JOIN ─────────────────────────────────
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
      choices: [
        { name: "Sí", value: "true" },
      ],
    }),

  plugins: [Plugins.hasPerms("ManageGuild"), Plugins.hasBotPerms("ManageRoles")],

  async code(ctx) {
    if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
    if (!ctx.guild) return noGuildReply(ctx);
    const role       = ctx.get("rol");
    const ignoreBots = ctx.get("ignorar_bots") === "true";
    const modTag     = ctx.user?.tag ?? ctx.author?.tag;

    if (!role) {
      const deleted = await JoinRole.findOneAndDelete({ guildId: ctx.guild.id });
      if (!deleted)
        return ctx.send({ content: "No hay un rol automático configurado", flags: MessageFlags.Ephemeral });

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
    await sendLog(ctx.guild, new EmbedBuilder()
      .setTitle("Rol join configurado")
      .setColor(GREEN)
      .addFields(
        { name: "Rol",          value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "Moderador",    value: modTag,                           inline: true },
        { name: "Ignorar bots", value: ignoreBots ? "Sí" : "No",        inline: true },
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
  params: new ParamsBuilder()
    .addRole({ 
      name: "rol", 
      description: "Selecciona un rol", 
      required: true }),

  async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
    try {
      if (!ctx.guild) return noGuildReply(ctx);

      const role = ctx.get("rol");
      if (!role) return ctx.send("No pude encontrar el rol");

      const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;

      const perms = role.permissions.toArray().sort().map(formatPerm);

      if (!perms.length) return ctx.send("Este rol no tiene permisos");

      const pages = [];
      for (let i = 0; i < perms.length; i += 15) {
        pages.push(perms.slice(i, i + 15));
      }

      let page = 0;

      const prevId = uniqueId("role_perms_prev");
      const nextId = uniqueId("role_perms_next");

      const buildEmbed = () => new EmbedBuilder()
        .setTitle(`Permisos de ${role.name}`)
        .setDescription(pages[page].join("\n"))
        .setColor(role.color || DARK)
        .setTimestamp();

      const reply = await ctx.send({
        embeds: [buildEmbed()],
        components: pages.length > 1 ? [buildPaginationRow(prevId, nextId, page, pages.length)] : [],
      });

      if (pages.length <= 1) return;

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60 * 1000,
        filter: i => [prevId, nextId].includes(i.customId),
      });

      collector.on("collect", async i => {
        if (i.user.id !== invoker.id) {
          return i.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
        }

        if (i.customId === prevId) page--;
        if (i.customId === nextId) page++;
        page = clampPage(page, pages.length);

        await i.update({
          embeds: [buildEmbed()],
          components: [buildPaginationRow(prevId, nextId, page, pages.length)]
        });
      });

      collector.on("end", () => reply.edit({ components: [] }).catch(() => {}));

    } catch (err) {
      log.error("Error en role permissions", { err: err?.message ?? String(err) });
      return handleCommandError(ctx, err);
    }
  }
}),
};

module.exports = { data };
