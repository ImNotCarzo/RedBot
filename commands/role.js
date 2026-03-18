const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("erine");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const sendLog = require("../utils/sendLog");
const { RED, GREEN, BLUE, DARK } = require("../utils/colors");

const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";

function noGuildReply(ctx) {
  return ctx.send({
    embeds: [new EmbedBuilder().setDescription("Este comando solo funciona en servidores").setColor(RED)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Invítame").setStyle(ButtonStyle.Link).setURL(INVITE_URL)
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

function roleHierarchyCheck(ctx, role) {
  if (role.managed)
    return "No puedo editar roles gestionados por integraciones";
  if (role.id === ctx.guild.id)
    return "No puedo editar el rol @everyone";
  if (role.position >= ctx.guild.members.me.roles.highest.position)
    return "No puedo actuar sobre ese rol porque está por encima del mío";
  return null;
}

function buildRoleEmbed(role) {
  const perms = role.permissions.toArray().map(p => `\`${p}\``);
  const hex   = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "Sin color";

  const embed = new EmbedBuilder()
    .setTitle(role.name)
    .setColor(role.color || DARK)
    .addFields(
      {
        name: "Información",
        value:
          `> **ID:** \`${role.id}\`\n` +
          `> **Color:** \`${hex}\`\n` +
          `> **Posición:** \`${role.position}\`\n` +
          `> **Mencionable:** \`${role.mentionable}\`\n` +
          `> **Gestionado:** \`${role.managed}\`\n` +
          `> **Separado (hoist):** \`${role.hoist}\``,
      },
      {
        name: `Permisos (${perms.length})`,
        value: perms.length ? perms.join(", ") : "Sin permisos",
      },
    )
    .setTimestamp();

  if (role.icon) embed.setThumbnail(role.iconURL({ size: 1024 }));
  return embed;
}

function buildPagRow(prevId, nextId, page, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page === total - 1),
  );
}

// ─────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────

const data = {
  data: new GroupBuilder({
    name: "role",
    description: "Comandos relacionados con roles",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })

  // ── INFO ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "info",
      description: "Muestra información de un rol",
    }),
    params: new ParamsBuilder()
      .addRole({ name: "rol", description: "Rol a inspeccionar", required: true }),

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);

      const role = ctx.get("rol");
      if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });

      const selectRoles = ctx.guild.roles.cache
        .filter(r => r.id !== ctx.guild.id)
        .sort((a, b) => b.position - a.position)
        .first(25);

      const selectId = `role_select_${Date.now()}`;
      const authorId = ctx.user?.id ?? ctx.author?.id;

      const components = selectRoles.size > 1
        ? [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(selectId)
              .setPlaceholder("Seleccionar otro rol...")
              .addOptions(
                selectRoles.map(r =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(r.name.slice(0, 100))
                    .setValue(r.id)
                )
              )
          )]
        : [];

      const msg = await ctx.send({ embeds: [buildRoleEmbed(role)], components });
      if (!components.length) return;

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 5 * 60 * 1000,
        filter: i => i.customId === selectId,
      });

      collector.on("collect", async i => {
        const newRole = ctx.guild.roles.cache.get(i.values[0]);
        if (!newRole) return i.reply({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });
        if (i.user.id !== authorId) return i.reply({ embeds: [buildRoleEmbed(newRole)], flags: MessageFlags.Ephemeral });
        await i.update({ embeds: [buildRoleEmbed(newRole)] });
      });

      collector.on("end", () => msg.edit({ components: [] }).catch(() => {}));
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
      if (!ctx.guild) return noGuildReply(ctx);

      const role = ctx.get("rol");
      if (!role) return ctx.send({ content: "No encontré ese rol", flags: MessageFlags.Ephemeral });

      const members = role.members.map(m => m.toString());
      if (!members.length) return ctx.send({ content: "Nadie tiene este rol", flags: MessageFlags.Ephemeral });

      const pages = [];
      for (let i = 0; i < members.length; i += 15) pages.push(members.slice(i, i + 15));
      let page = 0;

      const authorId = ctx.user?.id ?? ctx.author?.id;
      const prevId   = `role_users_prev_${Date.now()}`;
      const nextId   = `role_users_next_${Date.now()}`;

      const buildEmbed = () => new EmbedBuilder()
        .setTitle(`Usuarios con ${role.name}`)
        .setDescription(pages[page].join("\n"))
        .setColor(role.color || DARK)
        .setFooter({ text: `Página ${page + 1}/${pages.length} · ${members.length} usuarios en total` })
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

    async code(ctx) {
      const member = ctx.get("usuario");
      const role   = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tienes el permiso `ManageRoles`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tengo permiso para asignar roles", flags: MessageFlags.Ephemeral });

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
      } catch {
        await ctx.send({ content: "No se pudo asignar el rol", flags: MessageFlags.Ephemeral });
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

    async code(ctx) {
      const member = ctx.get("usuario");
      const role   = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tienes el permiso `ManageRoles`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tengo permiso para quitar roles", flags: MessageFlags.Ephemeral });

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
      } catch {
        await ctx.send({ content: "No se pudo quitar el rol", flags: MessageFlags.Ephemeral });
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

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);

      const role    = ctx.get("rol");
      const newName = ctx.get("nombre").slice(0, 100);
      const modTag  = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tienes el permiso `ManageRoles`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tengo permiso para editar roles", flags: MessageFlags.Ephemeral });

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
      } catch {
        await ctx.send({ content: "No se pudo renombrar el rol", flags: MessageFlags.Ephemeral });
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

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);

      const role   = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tienes el permiso `ManageRoles`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tengo permiso para editar roles", flags: MessageFlags.Ephemeral });

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
      } catch {
        await ctx.send({ content: "No se pudo cambiar el hoist", flags: MessageFlags.Ephemeral });
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

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);

      const role   = ctx.get("rol");
      const modTag = ctx.user?.tag ?? ctx.author?.tag;

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tienes el permiso `ManageRoles`", flags: MessageFlags.Ephemeral });

      if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
        return ctx.send({ content: "No tengo permiso para editar roles", flags: MessageFlags.Ephemeral });

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
      } catch {
        await ctx.send({ content: "No se pudo cambiar la mencionabilidad", flags: MessageFlags.Ephemeral });
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

  async code(ctx) {
    const role       = ctx.get("rol");
    const incluirBot = ctx.get("incluir_bots") === "true";
    const modTag     = ctx.user?.tag ?? ctx.author?.tag;

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
      return ctx.send({ content: "Necesitas el permiso `Administrator`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return ctx.send({ content: "No tengo permiso para gestionar roles", flags: MessageFlags.Ephemeral });

    const hierr = roleHierarchyCheck(ctx, role);
    if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

    if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
  await ctx.guild.members.fetch().catch(() => {});
}
    const targets = ctx.guild.members.cache.filter(m =>
      !m.roles.cache.has(role.id) &&
      (incluirBot ? true : !m.user.bot)
    );

    if (!targets.size)
      return ctx.send({ content: `Todos ${incluirBot ? "" : "los usuarios "}ya tienen el rol ${role}`, flags: MessageFlags.Ephemeral });

    const msg = await ctx.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(`Añadiendo ${role} a **0/${targets.size}** miembros...`)
          .setColor(BLUE),
      ],
    });

    let done = 0;
    let failed = 0;
    const total = targets.size;

    for (const [, member] of targets) {
      try {
        await member.roles.add(role, `${modTag}: role all`);
        done++;
      } catch {
        failed++;
      }

      if ((done + failed) % 10 === 0 || done + failed === total) {
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setDescription(`Añadiendo ${role} a **${done + failed}/${total}** miembros...`)
              .setColor(BLUE),
          ],
        }).catch(() => {});
      }
    }

    await msg.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle("Role all completado")
          .setColor(GREEN)
          .addFields(
            { name: "Rol",      value: `${role}`,     inline: true },
            { name: "Añadidos", value: `${done}`,     inline: true },
            { name: "Fallidos", value: `${failed}`,   inline: true },
          )
          .setTimestamp(),
      ],
    });

    const logEmbed = new EmbedBuilder()
      .setTitle("Role all ejecutado")
      .setColor(GREEN)
      .addFields(
        { name: "Rol",        value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "Moderador",  value: modTag,                           inline: true },
        { name: "Añadidos",   value: `${done}`,                       inline: true },
        { name: "Fallidos",   value: `${failed}`,                     inline: true },
        { name: "Bots",       value: incluirBot ? "Sí" : "No",        inline: true },
      )
      .setTimestamp();

    await sendLog(ctx.guild, logEmbed);
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

  async code(ctx) {
    const role       = ctx.get("rol");
    const incluirBot = ctx.get("incluir_bots") === "true";
    const modTag     = ctx.user?.tag ?? ctx.author?.tag;

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
      return ctx.send({ content: "Necesitas el permiso `Administrator`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return ctx.send({ content: "No tengo permiso para gestionar roles", flags: MessageFlags.Ephemeral });

    const hierr = roleHierarchyCheck(ctx, role);
    if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

    if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
  await ctx.guild.members.fetch().catch(() => {});
}
    const targets = ctx.guild.members.cache.filter(m =>
      m.roles.cache.has(role.id) &&
      (incluirBot ? true : !m.user.bot)
    );

    if (!targets.size)
      return ctx.send({ content: `Nadie ${incluirBot ? "" : "de los usuarios "}tiene el rol ${role}`, flags: MessageFlags.Ephemeral });

    const msg = await ctx.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(`Quitando ${role} a **0/${targets.size}** miembros...`)
          .setColor(RED),
      ],
    });

    let done = 0;
    let failed = 0;
    const total = targets.size;

    for (const [, member] of targets) {
      try {
        await member.roles.remove(role, `${modTag}: role removeall`);
        done++;
      } catch {
        failed++;
      }

      if ((done + failed) % 10 === 0 || done + failed === total) {
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setDescription(`Quitando ${role} a **${done + failed}/${total}** miembros...`)
              .setColor(RED),
          ],
        }).catch(() => {});
      }
    }

    await msg.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle("Role removeall completado")
          .setColor(RED)
          .addFields(
            { name: "Rol",      value: `${role}`,   inline: true },
            { name: "Quitados", value: `${done}`,   inline: true },
            { name: "Fallidos", value: `${failed}`, inline: true },
          )
          .setTimestamp(),
      ],
    });

    const logEmbed = new EmbedBuilder()
      .setTitle("Role removeall ejecutado")
      .setColor(RED)
      .addFields(
        { name: "Rol",       value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "Moderador", value: modTag,                           inline: true },
        { name: "Quitados",  value: `${done}`,                       inline: true },
        { name: "Fallidos",  value: `${failed}`,                     inline: true },
        { name: "Bots",      value: incluirBot ? "Sí" : "No",        inline: true },
      )
      .setTimestamp();

    await sendLog(ctx.guild, logEmbed);
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

  async code(ctx) {
    const role   = ctx.get("rol");
    const accion = ctx.get("accion");
    const modTag = ctx.user?.tag ?? ctx.author?.tag;

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
      return ctx.send({ content: "Necesitas el permiso `Administrator`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return ctx.send({ content: "No tengo permiso para gestionar roles", flags: MessageFlags.Ephemeral });

    const hierr = roleHierarchyCheck(ctx, role);
    if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });

    if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
  await ctx.guild.members.fetch().catch(() => {});
}
    const targets = ctx.guild.members.cache.filter(m =>
      m.user.bot &&
      (accion === "add" ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id))
    );

    if (!targets.size)
      return ctx.send({ content: `No hay bots a los que ${accion === "add" ? "añadir" : "quitar"} el rol ${role}`, flags: MessageFlags.Ephemeral });

    const color = accion === "add" ? GREEN : RED;
    const verbo = accion === "add" ? "Añadiendo" : "Quitando";

    const msg = await ctx.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(`${verbo} ${role} a **0/${targets.size}** bots...`)
          .setColor(color),
      ],
    });

    let done = 0;
    let failed = 0;
    const total = targets.size;

    for (const [, member] of targets) {
      try {
        accion === "add"
          ? await member.roles.add(role, `${modTag}: role bots`)
          : await member.roles.remove(role, `${modTag}: role bots`);
        done++;
      } catch {
        failed++;
      }

      if ((done + failed) % 5 === 0 || done + failed === total) {
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setDescription(`${verbo} ${role} a **${done + failed}/${total}** bots...`)
              .setColor(color),
          ],
        }).catch(() => {});
      }
    }

    await msg.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Role bots completado`)
          .setColor(color)
          .addFields(
            { name: "Rol",                                            value: `${role}`,   inline: true },
            { name: accion === "add" ? "Añadidos" : "Quitados",      value: `${done}`,   inline: true },
            { name: "Fallidos",                                       value: `${failed}`, inline: true },
          )
          .setTimestamp(),
      ],
    });

    await sendLog(ctx.guild, new EmbedBuilder()
      .setTitle("Role bots ejecutado")
      .setColor(color)
      .addFields(
        { name: "Rol",       value: `${role.name} (\`${role.id}\`)`,        inline: true },
        { name: "Moderador", value: modTag,                                   inline: true },
        { name: "Acción",    value: accion === "add" ? "Añadir" : "Quitar",  inline: true },
        { name: accion === "add" ? "Añadidos" : "Quitados", value: `${done}`, inline: true },
        { name: "Fallidos",  value: `${failed}`,                             inline: true },
      )
      .setTimestamp()
    );
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

  async code(ctx) {
    const role   = ctx.get("rol");
    const accion = ctx.get("accion");
    const modTag = ctx.user?.tag ?? ctx.author?.tag;

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
      return ctx.send({ content: "Necesitas el permiso `Administrator`", flags: MessageFlags.Ephemeral });

    if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return ctx.send({ content: "No tengo permiso para gestionar roles", flags: MessageFlags.Ephemeral });

    const hierr = roleHierarchyCheck(ctx, role);
    if (hierr) return ctx.send({ content: hierr, flags: MessageFlags.Ephemeral });
if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
  await ctx.guild.members.fetch().catch(() => {});
}
    const targets = ctx.guild.members.cache.filter(m =>
      !m.user.bot &&
      (accion === "add" ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id))
    );

    if (!targets.size)
      return ctx.send({ content: `No hay usuarios a los que ${accion === "add" ? "añadir" : "quitar"} el rol ${role}`, flags: MessageFlags.Ephemeral });

    const color = accion === "add" ? GREEN : RED;
    const verbo = accion === "add" ? "Añadiendo" : "Quitando";

    const msg = await ctx.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(`${verbo} ${role} a **0/${targets.size}** usuarios...`)
          .setColor(color),
      ],
    });

    let done = 0;
    let failed = 0;
    const total = targets.size;

    for (const [, member] of targets) {
      try {
        accion === "add"
          ? await member.roles.add(role, `${modTag}: role humans`)
          : await member.roles.remove(role, `${modTag}: role humans`);
        done++;
      } catch {
        failed++;
      }

      if ((done + failed) % 10 === 0 || done + failed === total) {
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setDescription(`${verbo} ${role} a **${done + failed}/${total}** usuarios...`)
              .setColor(color),
          ],
        }).catch(() => {});
      }
    }

    await msg.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle("Role humans completado")
          .setColor(color)
          .addFields(
            { name: "Rol",                                           value: `${role}`,   inline: true },
            { name: accion === "add" ? "Añadidos" : "Quitados",     value: `${done}`,   inline: true },
            { name: "Fallidos",                                      value: `${failed}`, inline: true },
          )
          .setTimestamp(),
      ],
    });

    await sendLog(ctx.guild, new EmbedBuilder()
      .setTitle("Role humans ejecutado")
      .setColor(color)
      .addFields(
        { name: "Rol",       value: `${role.name} (\`${role.id}\`)`,        inline: true },
        { name: "Moderador", value: modTag,                                   inline: true },
        { name: "Acción",    value: accion === "add" ? "Añadir" : "Quitar",  inline: true },
        { name: accion === "add" ? "Añadidos" : "Quitados", value: `${done}`, inline: true },
        { name: "Fallidos",  value: `${failed}`,                             inline: true },
      )
      .setTimestamp()
    );
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
      description: "Rol a asignar al entrar (no usar para desactivar)",
      required: false,
    }),

  async code(ctx) {
    const role   = ctx.get("rol");
    const modTag = ctx.user?.tag ?? ctx.author?.tag;

    if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return ctx.send({ content: "Necesitas el permiso `ManageGuild`", flags: MessageFlags.Ephemeral });

    const { JoinRole } = require("../events/guildMemberAdd");

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
      { roleId: role.id },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("Rol automático configurado")
      .setDescription(`${role} se asignará a cada usuario que entre al servidor`)
      .setColor(GREEN)
      .setTimestamp();

    await ctx.send({ embeds: [embed] });
    await sendLog(ctx.guild, new EmbedBuilder()
      .setTitle("Rol join configurado")
      .setColor(GREEN)
      .addFields(
        { name: "Rol",       value: `${role.name} (\`${role.id}\`)`, inline: true },
        { name: "Moderador", value: modTag,                           inline: true },
      )
      .setTimestamp()
    );
  },
}),
};

module.exports = { data };
