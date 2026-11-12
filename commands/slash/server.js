const {
  GroupBuilder,
  CommandBuilder,
  ComponentsV2Builder,
  MessageFlags,
  V2Text,
  V2View,
} = require("gralonium");
const {
  Logger,
  noGuildReply,
  handleCommandError,
  createListPaginator,
  formatSortedRoles,
} = require("../../src/runtime");
const { RED } = require("../../src/config");

const PAGE_SIZE = 15;
const VERIFICATION_LEVELS = { 0: "Ninguno", 1: "Bajo", 2: "Medio", 3: "Alto", 4: "Muy alto" };
const log = new Logger("CMD_SERVER", process.env.LOG_LEVEL);

function buildServerImageCard(guild, title, imageUrl) {
  return ComponentsV2Builder.imageView({
    title,
    image: imageUrl,
    color: RED,
    links: [{ label: "Abrir imagen", url: imageUrl }],
  });
}

function getServerViewBuilder(guild, selected) {
  if (selected === "logo") {
    if (!guild.iconURL()) return { error: "Este servidor no tiene logo" };
    return { builder: buildServerImageCard(guild, `Logo de ${guild.name}`, guild.iconURL({ size: 4096, extension: "png" })) };
  }
  if (selected === "banner") {
    const bannerURL = guild.bannerURL({ size: 4096, extension: "png" });
    if (!bannerURL) return { error: "Este servidor no tiene banner" };
    return { builder: buildServerImageCard(guild, `Banner de ${guild.name}`, bannerURL) };
  }
  if (selected === "emojis") {
    const emojis = guild.emojis.cache.map((e) => e.toString());
    if (!emojis.length) return { error: "Este servidor no tiene emojis" };
    const desc = emojis.reduce((acc, cur) => (acc.length + cur.length + 1 > 3750 ? acc : acc + (acc ? " " : "") + cur), "");
    return {
      builder: new ComponentsV2Builder({ color: RED })
        .addText(V2Text.heading(`Emojis de ${V2Text.clip(guild.name, 100)} (${emojis.length})`, 3))
        .addSeparator("small")
        .addText(desc),
    };
  }
  return null;
}

function getSortedServerRoles(guild) {
  return formatSortedRoles(guild.roles.cache, guild.id);
}

function buildServerRolesCard(guild, totalRoles, pageItems, pageIndex, totalPages, { controls = null } = {}) {
  const start = pageIndex * PAGE_SIZE;
  const builder = new ComponentsV2Builder({ color: RED })
    .addSection(
      [V2Text.heading(`Roles de ${guild.name} (${pageIndex + 1}/${totalPages})`, 3, 200)],
      { thumbnail: guild.iconURL({ size: 256, extension: "png" }), fallbackToText: true }
    )
    .addSeparator("small")
    .addText(V2Text.clip(pageItems.map((r, i) => `${start + i + 1}. ${r}`).join("\n"), 3600))
    .addText(V2Text.subtext(`${totalRoles} roles en total`, 200));

  if (controls?.length) builder.addSpacer("small").addButtonsRow(controls);
  return builder;
}

function buildServerInfoCard(guild, owner) {
  const createdTs = Math.floor(guild.createdTimestamp / 1000);
  const roleCount = guild.roles.cache.filter((r) => r.id !== guild.id).size;

  const generalRows = [
    ["ID", V2Text.code(guild.id)],
    ["Dueño", owner ? owner.user.username : "No disponible"],
    ["Creación", `<t:${createdTs}:F> (<t:${createdTs}:R>)`],
    guild.vanityURLCode ? ["Tag", V2Text.code(guild.vanityURLCode)] : null,
  ];
  const statsRows = [
    ["Miembros", V2Text.code(guild.memberCount)],
    ["Canales", V2Text.code(guild.channels.cache.size)],
    ["Roles", V2Text.code(roleCount)],
    ["Emojis", V2Text.code(guild.emojis.cache.size)],
    ["Boost", V2Text.code(`${guild.premiumSubscriptionCount} (Nivel ${guild.premiumTier})`)],
  ];
  const securityRows = [
    ["Verificación", V2Text.code(VERIFICATION_LEVELS[guild.verificationLevel] ?? guild.verificationLevel)],
  ];

  return new ComponentsV2Builder({ color: RED })
    .addSection(
      [V2Text.heading(guild.name, 3, 100), V2Text.sectionBlock("General", generalRows)],
      { thumbnail: guild.iconURL({ size: 1024, extension: "png" }) }
    )
    .addSectionBlock("Estadísticas", statsRows, { separator: true })
    .addSectionBlock("Seguridad", securityRows, { separator: true });
}

function createServerViewCommand(name, description) {
  return {
    data: new CommandBuilder({ name, description }),
    async code(ctx) {
      await ctx.defer();
      try {
        const guild = ctx.guild;
        if (!guild) return noGuildReply(ctx);

        const view = getServerViewBuilder(guild, name);
        if (view.error) return ctx.send(view.error);

        await ctx.send(view.builder);
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
        await ctx.defer();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const owner = await guild.fetchOwner().catch(() => null);
          const authorId = ctx.user?.id;

          const baseOptions = [
            { label: "Logo", value: "logo", description: "Logo del servidor" },
            ...(guild.banner ? [{ label: "Banner", value: "banner", description: "Banner del servidor" }] : []),
            { label: "Roles", value: "roles", description: "Roles del servidor" },
            { label: "Emojis", value: "emojis", description: "Emojis del servidor" },
          ];
          const allOptions = [{ label: "Info", value: "info", description: "Información del servidor" }, ...baseOptions];

          const roles = getSortedServerRoles(guild);
          const totalRolePages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));

          const renderView = ({ state, view, isEnded }) => {
            let builder;
            if (state.tab === "roles") {
              const safePage = Math.max(0, Math.min(totalRolePages - 1, state.pageIndex));
              const pageItems = roles.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
              const controls = !isEnded && totalRolePages > 1
                ? [
                    { label: "◀", customId: view.id("page", "prev"), style: "secondary", disabled: safePage <= 0 },
                    { label: "▶", customId: view.id("page", "next"), style: "secondary", disabled: safePage >= totalRolePages - 1 },
                  ]
                : null;
              builder = buildServerRolesCard(guild, roles.length, pageItems, safePage, totalRolePages, { controls });
            } else if (state.tab !== "info") {
              builder = getServerViewBuilder(guild, state.tab).builder;
            } else {
              builder = buildServerInfoCard(guild, owner);
            }

            if (!isEnded) {
              builder.addSpacer("small").addSelectMenu({
                customId: view.id("select"),
                placeholder: "Navegar...",
                options: state.tab === "info" ? baseOptions : allOptions,
              });
            }

            return builder;
          };

          const serverView = new V2View({
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

                if (selected === "roles") {
                  if (!roles.length) {
                    await interaction.reply({ content: "Este servidor no tiene roles", flags: MessageFlags.Ephemeral }).catch(() => {});
                    return false;
                  }
                  setState({ tab: "roles", pageIndex: 0 });
                  return;
                }

                if (selected !== "info") {
                  const view = getServerViewBuilder(guild, selected);
                  if (view?.error) {
                    await interaction.reply({ content: view.error, flags: MessageFlags.Ephemeral }).catch(() => {});
                    return false;
                  }
                }

                setState({ tab: selected, pageIndex: 0 });
              },
              page: ({ parts, state, setState }) => {
                const delta = parts[0] === "prev" ? -1 : 1;
                const next = Math.max(0, Math.min(totalRolePages - 1, state.pageIndex + delta));
                setState({ pageIndex: next });
              },
            },
          });

          await serverView.send(ctx);
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
        await ctx.defer();
        try {
          const guild = ctx.guild;
          if (!guild) return noGuildReply(ctx);

          const roles = getSortedServerRoles(guild);
          if (!roles.length) return ctx.send("No hay roles");

          const authorId = ctx.user?.id;
          const paginator = createListPaginator({
            items: roles,
            perPage: PAGE_SIZE,
            ownerId: authorId,
            render: ({ items: pageItems, pageIndex, totalPages, controls }) =>
              buildServerRolesCard(guild, roles.length, pageItems, pageIndex, totalPages, { controls }),
          });

          await paginator.send(ctx);
        } catch (err) {
          log.error("Error en server roles", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    }),
};

module.exports = { data };
