const { GroupBuilder, CommandBuilder } = require("gralonium");
const {
  ActionRowBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const { Logger, clampPage, paginateArray, noGuildReply, uniqueId, handleCommandError } = require("../../src/runtime");
const { RED } = require("../../src/config");
const {
  createContainer,
  addHeaderSection,
  addSeparator,
  addTextBlock,
  clipV2Text,
  buildImageViewContainer,
  buildPaginatedListContainer,
  buildV2Payload,
} = require("../../src/v2");

const VERIFICATION_LEVELS = { 0: "Ninguno", 1: "Bajo", 2: "Medio", 3: "Alto", 4: "Muy alto" };
const log = new Logger("CMD_SERVER", process.env.LOG_LEVEL);

function getServerViewPayload(guild, selected, extraRows = [], { ephemeral = false } = {}) {
  if (selected === "logo") {
    if (!guild.iconURL()) return { error: "Este servidor no tiene logo" };
    const url = guild.iconURL({ size: 4096, extension: "png" });
    return {
      payload: buildV2Payload(
        buildImageViewContainer({
          title: `Logo de ${guild.name}`,
          imageUrl: url,
          color: RED,
          extraRows,
        }),
        { ephemeral }
      ),
    };
  }
  if (selected === "banner") {
    const bannerURL = guild.bannerURL({ size: 4096, extension: "png" });
    if (!bannerURL) return { error: "Este servidor no tiene banner" };
    return {
      payload: buildV2Payload(
        buildImageViewContainer({
          title: `Banner de ${guild.name}`,
          imageUrl: bannerURL,
          color: RED,
          extraRows,
        }),
        { ephemeral }
      ),
    };
  }
  if (selected === "emojis") {
    const emojis = guild.emojis.cache.map((e) => e.toString());
    if (!emojis.length) return { error: "Este servidor no tiene emojis" };
    const desc = emojis.reduce((acc, cur) => (acc.length + cur.length + 1 > 3750 ? acc : acc + (acc ? " " : "") + cur), "");
    const container = createContainer(RED);
    addTextBlock(container, `### Emojis de ${clipV2Text(guild.name, 100)} (${emojis.length})`);
    addSeparator(container);
    addTextBlock(container, desc);
    if (extraRows.length) {
      addSeparator(container, SeparatorSpacingSize.Small, false);
      for (const row of extraRows) {
        if (row) container.addActionRowComponents(row);
      }
    }
    return { payload: buildV2Payload(container, { ephemeral }) };
  }
  return null;
}

function getSortedServerRoles(guild) {
  return guild.roles.cache
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => `<@&${r.id}>`);
}

function buildServerRolesPayload(guild, roles, pages, page, { prevId = null, nextId = null, extraRows = [], interactive = true, ephemeral = false } = {}) {
  const container = buildPaginatedListContainer({
    title: `Roles de ${guild.name} (${page + 1}/${pages.length})`,
    lines: pages[page].map((r, i) => `${page * 15 + i + 1}. ${r}`),
    footer: `${roles.length} roles en total`,
    thumbnailUrl: guild.iconURL({ size: 256, extension: "png" }),
    color: RED,
    page,
    totalPages: pages.length,
    prevId,
    nextId,
    extraRows,
    interactive,
  });
  return buildV2Payload(container, { ephemeral });
}

function buildServerInfoPayload(guild, owner, { extraRows = [], ephemeral = false } = {}) {
  const createdTs = Math.floor(guild.createdTimestamp / 1000);
  const roleCount = guild.roles.cache.filter((r) => r.id !== guild.id).size;

  const generalLines =
    `> **ID:** \`${guild.id}\`\n` +
    `> **Dueño:** ${owner ? owner.user.username : "No disponible"}\n` +
    `> **Creación:** <t:${createdTs}:F> (<t:${createdTs}:R>)` +
    (guild.vanityURLCode ? `\n> **Tag:** \`${guild.vanityURLCode}\`` : "");

  const statsLines =
    `> **Miembros:** \`${guild.memberCount}\`\n` +
    `> **Canales:** \`${guild.channels.cache.size}\`\n` +
    `> **Roles:** \`${roleCount}\`\n` +
    `> **Emojis:** \`${guild.emojis.cache.size}\`\n` +
    `> **Boost:** \`${guild.premiumSubscriptionCount} (Nivel ${guild.premiumTier})\``;

  const securityLines = `> **Verificación:** \`${VERIFICATION_LEVELS[guild.verificationLevel] ?? guild.verificationLevel}\``;

  const container = createContainer(RED);
  addHeaderSection(
    container,
    [`### ${clipV2Text(guild.name, 100)}`, `**General**\n${generalLines}`],
    guild.iconURL({ size: 1024, extension: "png" })
  );
  addSeparator(container);
  addTextBlock(container, `**Estadísticas**\n${statsLines}`);
  addSeparator(container);
  addTextBlock(container, `**Seguridad**\n${securityLines}`);

  if (extraRows.length) {
    addSeparator(container, SeparatorSpacingSize.Small, false);
    for (const row of extraRows) {
      if (row) container.addActionRowComponents(row);
    }
  }

  return buildV2Payload(container, { ephemeral });
}

function createServerViewCommand(name, description) {
  return {
    data: new CommandBuilder({ name, description }),
    async code(ctx) {
      if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const view = getServerViewPayload(guild, name);
        if (view.error) return ctx.send(view.error);

        await ctx.send(view.payload);
      } catch (err) {
        log.error(`Error en server ${name}`, { err: err?.message ?? String(err) });
        return handleCommandError(ctx, err);
      }
    },
  };
}

const data = {
  data: new GroupBuilder({
    name: "server",
    description: "Comandos de información del servidor",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({
        name: "info",
        description: "Muestra información del servidor",
      }),
      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const owner = await guild.fetchOwner().catch(() => null);

          const baseOptions = [
            { label: "Logo", value: "logo", description: "Logo del servidor" },
            ...(guild.banner ? [{ label: "Banner", value: "banner", description: "Banner del servidor" }] : []),
            { label: "Roles", value: "roles", description: "Roles del servidor" },
            { label: "Emojis", value: "emojis", description: "Emojis del servidor" },
          ];
          const allOptions = [{ label: "Info", value: "info", description: "Información del servidor" }, ...baseOptions];

          const selectId = uniqueId("srv_select");
          const prevId = uniqueId("srv_prev");
          const nextId = uniqueId("srv_next");

          const buildSelectRow = (includeInfo) =>
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(selectId)
                .setPlaceholder("Navegar...")
                .addOptions(
                  (includeInfo ? allOptions : baseOptions).map((o) =>
                    new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description)
                  )
                )
            );

          let renderCurrent = (interactive = true) =>
            buildServerInfoPayload(guild, owner, { extraRows: interactive ? [buildSelectRow(false)] : [] });

          const reply = await ctx.send(renderCurrent(true));
          const authorId = ctx.user?.id ?? ctx.author?.id;
          let rolesPageCollector = null;

          const collector = reply.createMessageComponentCollector({
            time: 5 * 60 * 1000,
            filter: (i) => i.customId === selectId || [prevId, nextId].includes(i.customId),
          });

          collector.on("collect", async (interaction) => {
            const isAuthor = interaction.user.id === authorId;

            if ([prevId, nextId].includes(interaction.customId)) {
              if (!isAuthor) return interaction.reply({ content: "No puedes interactuar con esto", flags: MessageFlags.Ephemeral });
              return;
            }

            const selected = interaction.values?.[0];
            if (!selected) return;

            if (isAuthor && rolesPageCollector) {
              rolesPageCollector.stop();
              rolesPageCollector = null;
            }

            if (selected === "info") {
              if (!isAuthor) return interaction.reply(buildServerInfoPayload(guild, owner, { ephemeral: true }));
              renderCurrent = (interactive = true) =>
                buildServerInfoPayload(guild, owner, { extraRows: interactive ? [buildSelectRow(false)] : [] });
              return interaction.update(renderCurrent(true));
            }

            const ephemView = !isAuthor ? getServerViewPayload(guild, selected, [], { ephemeral: true }) : null;
            if (!isAuthor && ephemView) {
              if (ephemView.error) return interaction.reply({ content: ephemView.error, flags: MessageFlags.Ephemeral });
              return interaction.reply(ephemView.payload);
            }

            const checkView = getServerViewPayload(guild, selected, [buildSelectRow(true)]);
            if (checkView) {
              if (checkView.error) return interaction.reply({ content: checkView.error, flags: MessageFlags.Ephemeral });
              renderCurrent = (interactive = true) =>
                getServerViewPayload(guild, selected, interactive ? [buildSelectRow(true)] : []).payload;
              return interaction.update(renderCurrent(true));
            }

            if (selected === "roles") {
              const roles = getSortedServerRoles(guild);
              if (!roles.length) return interaction.reply({ content: "Este servidor no tiene roles", flags: MessageFlags.Ephemeral });

              const pages = paginateArray(roles, 15);
              let page = 0;

              if (!isAuthor) {
                return interaction.reply(
                  buildServerRolesPayload(guild, roles, pages, page, { interactive: false, ephemeral: true })
                );
              }

              renderCurrent = (interactive = true, includePag = true) =>
                buildServerRolesPayload(guild, roles, pages, page, {
                  prevId,
                  nextId,
                  extraRows: interactive ? [buildSelectRow(true)] : [],
                  interactive: interactive && includePag,
                });

              await interaction.update(renderCurrent(true, true));

              if (pages.length <= 1) return;

              rolesPageCollector = reply.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 2 * 60 * 1000,
                filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
              });

              rolesPageCollector.on("collect", async (i) => {
                if (i.customId === prevId) page--;
                if (i.customId === nextId) page++;
                page = clampPage(page, pages.length);
                await i.update(renderCurrent(true, true));
              });

              rolesPageCollector.on("end", async (_c, reason) => {
                if (reason === "time") {
                  renderCurrent = (interactive = true) =>
                    buildServerRolesPayload(guild, roles, pages, page, {
                      extraRows: interactive ? [buildSelectRow(true)] : [],
                      interactive: false,
                    });
                  await reply.edit(renderCurrent(true)).catch(() => {});
                }
              });
            }
          });

          collector.on("end", async (_c, reason) => {
            if (rolesPageCollector) rolesPageCollector.stop();
            if (reason === "time") await reply.edit(renderCurrent(false)).catch(() => {});
          });
        } catch (err) {
          log.error("Error en server info", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand(createServerViewCommand("logo", "Muestra el logo del servidor"))
    .addCommand(createServerViewCommand("banner", "Muestra el banner del servidor"))
    .addCommand(createServerViewCommand("emojis", "Muestra todos los emojis del servidor"))
    .addCommand({
      data: new CommandBuilder({
        name: "roles",
        description: "Lista los roles del servidor",
      }),
      async code(ctx) {
        if (ctx.interaction && !ctx.interaction.deferred) await ctx.interaction.deferReply();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const roles = getSortedServerRoles(guild);
          if (!roles.length) return ctx.send("No hay roles");

          const pages = paginateArray(roles, 15);
          let page = 0;

          const authorId = ctx.user?.id ?? ctx.author?.id;
          const prevId = uniqueId("srv_roles_prev");
          const nextId = uniqueId("srv_roles_next");

          const reply = await ctx.send(
            buildServerRolesPayload(guild, roles, pages, page, { prevId, nextId, interactive: true })
          );

          if (pages.length <= 1) return;

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 2 * 60 * 1000,
            filter: (i) => [prevId, nextId].includes(i.customId),
          });

          collector.on("collect", async (interaction) => {
            if (interaction.user.id !== authorId) {
              return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
            }
            if (interaction.customId === prevId) page--;
            if (interaction.customId === nextId) page++;
            page = clampPage(page, pages.length);
            await interaction.update(
              buildServerRolesPayload(guild, roles, pages, page, { prevId, nextId, interactive: true })
            );
          });

          collector.on("end", async (_c, reason) => {
            if (reason === "time") {
              await reply.edit(
                buildServerRolesPayload(guild, roles, pages, page, { interactive: false })
              ).catch(() => {});
            }
          });
        } catch (err) {
          log.error("Error en server roles", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    }),
};

module.exports = { data };
