const {
  CommandBuilder,
  GroupBuilder,
  ParamsBuilder,
  ComponentsV2Builder,
  MessageFlags,
  V2Text,
  V2View,
  V2Paginator,
} = require("gralonium");
const {
  Logger,
  noGuildReply,
  formatPermissionName: formatPermName,
  handleCommandError,
} = require("../../src/runtime");
const { resolveMemberFlexible: resolveMember } = require("../../src/adapter");
const { RED, DARK } = require("../../src/config");

const PAGE_SIZE = 15;

const log = new Logger("CMD_USER", process.env.LOG_LEVEL);

const BADGE_NAMES = {
  Staff: "Personal de Discord",
  Partner: "Servidor Socio",
  Hypesquad: "Eventos HypeSquad",
  BugHunterLevel1: "Cazador de Errores",
  BugHunterLevel2: "Cazador de Errores (Oro)",
  HypeSquadOnlineHouse1: "HypeSquad Bravery",
  HypeSquadOnlineHouse2: "HypeSquad Brilliance",
  HypeSquadOnlineHouse3: "HypeSquad Balance",
  PremiumEarlySupporter: "Partidario Inicial de Nitro",
  TeamPseudoUser: "Equipo de Discord",
  VerifiedBot: "Bot Verificado",
  VerifiedDeveloper: "Desarrollador de Bots Verificado",
  CertifiedModerator: "Moderador Certificado",
  BotHTTPInteractions: "Interacciones HTTP",
  ActiveDeveloper: "Desarrollador Activo",
  Quarantined: "En Cuarentena",
  Spammer: "Spammer",
  Collaborator: "Colaborador",
  RestrictedCollaborator: "Colaborador Restringido",
};

function formatUserBadges(user) {
  const flags = user?.flags?.toArray() ?? [];
  if (!flags.length) return "Sin insignias";
  return flags.map((f) => `\`${BADGE_NAMES[f] ?? f}\``).join(", ");
}

function cleanDecoLabel(raw, fallback) {
  if (!raw || typeof raw !== "string" || /^\d{15,22}$/.test(raw)) return fallback;
  const cleaned = raw
    .replace(/^collectibles[/_.-]*/i, "")
    .replace(/^nameplates[/_.-]*/i, "")
    .replace(/[/_-]+/g, " ")
    .trim();
  if (!cleaned || /^\d+$/.test(cleaned)) return fallback;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function resolveUser(ctx, input) {
  const invoker = ctx.user;
  if (!input) return invoker ?? null;
  if (typeof input === "object") return input.user ?? input;
  const match = String(input).trim().match(/^(?:<@!?)?(\d{17,20})>?$/);
  const client = ctx.bot ?? ctx.client ?? ctx.data?.client;
  if (match && client?.users) return client.users.fetch(match[1]).catch(() => null);
  return null;
}

function getMemberColor(member, fallback = DARK) {
  return member?.displayColor ? `#${member.displayColor.toString(16).padStart(6, "0")}` : fallback;
}

function slicePage(items, pageIndex = 0, perPage = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.max(0, Math.min(totalPages - 1, pageIndex));
  const start = safePage * perPage;
  return { pageIndex: safePage, totalPages, start, items: items.slice(start, start + perPage) };
}

function buildListCard({ title, subtitle = null, lines, footer = null, thumbnail, color, controls = null }) {
  const headerLines = [V2Text.heading(title, 3, 200)];
  if (subtitle) headerLines.push(V2Text.subtext(subtitle, 200));

  const builder = new ComponentsV2Builder({ color })
    .addSection(headerLines, { thumbnail, fallbackToText: true })
    .addSeparator("small")
    .addText(V2Text.clip(lines.join("\n"), 3600));

  if (footer) builder.addText(V2Text.subtext(footer, 200));
  if (controls?.length) builder.addSpacer("small").addButtonsRow(controls);
  return builder;
}

function buildRolesCard(member, user, roles, pageIndex, totalPages, { controls = null } = {}) {
  const start = pageIndex * PAGE_SIZE;
  return buildListCard({
    title: user.username,
    subtitle: "Roles del usuario",
    lines: roles.map((r, i) => `${start + i + 1}. ${r}`),
    footer: totalPages > 1 ? `Página ${pageIndex + 1}/${totalPages}` : null,
    thumbnail: user.displayAvatarURL({ size: 256 }),
    color: getMemberColor(member, DARK),
    controls,
  });
}

function buildPermsCard(user, perms, pageIndex, totalPages, color, { controls = null } = {}) {
  return buildListCard({
    title: `Permisos de ${user.username}`,
    lines: perms,
    footer: totalPages > 1 ? `Página ${pageIndex + 1}/${totalPages}` : null,
    thumbnail: user.displayAvatarURL({ size: 256 }),
    color: color || DARK,
    controls,
  });
}

function buildUserImageCard(user, { title, imageUrl, color } = {}) {
  return new ComponentsV2Builder({ color })
    .addText(`${V2Text.subtext(user.username, 120)}\n${V2Text.heading(title, 3, 200)}`)
    .addGallery(imageUrl)
    .addSpacer("small")
    .addButton({ label: "Abrir imagen", style: "link", url: imageUrl });
}

function buildUserInfoCard({ user, member = null, color = RED } = {}) {
  const createdTs = Math.floor(user.createdTimestamp / 1000);
  const insignias = formatUserBadges(user);
  const generalRows = [
    ["ID", V2Text.code(user.id)],
    member ? ["Color del rol", V2Text.code(color)] : null,
    ["Insignias", insignias],
    ["Cuenta creada", `<t:${createdTs}:F> (<t:${createdTs}:R>)`],
  ];

  const builder = new ComponentsV2Builder({ color }).addSection(
    [V2Text.heading(user.username, 3, 100), V2Text.sectionBlock("General", generalRows)],
    { thumbnail: user.displayAvatarURL({ size: 1024 }) }
  );

  if (member) {
    const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    builder.addSectionBlock(
      "Servidor",
      [
        ["Apodo", member.nickname ?? "Sin apodo"],
        ["Ingreso", joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "No disponible"],
      ],
      { separator: true }
    );
  }

  for (const field of buildExtendedFields(member, user)) {
    builder.addSeparator("small").addText(`**${field.name}**\n${field.value}`);
  }

  return builder;
}

function addNavSelect(builder, customId, includeInfo, options) {
  const opts = includeInfo
    ? [{ label: "Info", value: "info", description: "Información del usuario" }, ...options]
    : options;
  return builder.addSpacer("small").addSelectMenu({
    customId,
    placeholder: "Navegar...",
    options: opts,
  });
}

function buildExtendedFields(member, user) {
  const fields = [];

  const pg = user.primaryGuild;
  if (pg?.tag) {
    const badgeURL = user.guildTagBadgeURL?.({ size: 4096 }) ?? null;
    fields.push({
      name: "Tag de servidor",
      value:
        `> **Etiqueta:** \`${pg.tag}\`\n` +
        `> **ID del servidor:** \`${pg.identityGuildId ?? "N/A"}\`\n` +
        `> **Insignia:** ${badgeURL ? `[Ver insignia](${badgeURL})` : "Sin insignia"}`,
    });
  }

  const activeDecData = member?.avatarDecorationData ?? user.avatarDecorationData ?? null;
  const avatarDecURL = member
    ? member.displayAvatarDecorationURL?.({ size: 4096 }) ?? user.avatarDecorationURL?.({ size: 4096 })
    : user.avatarDecorationURL?.({ size: 4096 });
  const nameplate = user.collectibles?.nameplate ?? null;

  const decoLines = [];
  if (activeDecData || avatarDecURL) {
    const decLink = avatarDecURL ? `[Ver decoración](${avatarDecURL})` : "Activa";
    const shopLink = activeDecData?.skuId
      ? ` • [Tienda](https://discord.com/shop#itemSkuId=${activeDecData.skuId})`
      : "";
    decoLines.push(`> **Decoración de avatar:** ${decLink}${shopLink}`);
  }
  if (nameplate) {
    const plateName = cleanDecoLabel(nameplate.label || nameplate.palette, "Ver placa");
    const plateLink = nameplate.skuId
      ? `[${plateName}](https://discord.com/shop#itemSkuId=${nameplate.skuId})`
      : plateName;
    decoLines.push(`> **Placa de nombre:** ${plateLink}`);
  }
  if (decoLines.length) {
    fields.push({ name: "Decoraciones", value: decoLines.join("\n") });
  }

  return fields;
}

const data = {
  data: new GroupBuilder({
    name: "user",
    description: "Comandos de usuario",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "info", description: "Muestra información general de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        await ctx.defer();
        try {
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.member?.user;
          const guild = ctx.guild;

          let user;
          let fullMember = null;
          let colorRol = RED;

          if (!guild) {
            const baseUser = await resolveUser(ctx, input);
            if (!baseUser) return ctx.send("No pude encontrar al usuario");
            user = await baseUser.fetch(true).catch(() => baseUser);
          } else {
            const member = await resolveMember(ctx, input);
            if (!member) return ctx.send("No pude encontrar al usuario");
            user = await member.user.fetch(true).catch(() => member.user);
            fullMember = await member.fetch(true).catch(() => member);
            colorRol = getMemberColor(member, DARK);
          }

          const hasBanner = Boolean(user.banner || fullMember?.banner);
          const getBannerUrl = () => fullMember?.bannerURL?.({ size: 4096 }) ?? user.bannerURL({ size: 4096 }) ?? null;

          const avatarOpts = { extension: "png", size: 4096 };
          const serverAvatar = fullMember ? fullMember.displayAvatarURL(avatarOpts) : user.displayAvatarURL(avatarOpts);
          const globalAvatar = user.displayAvatarURL(avatarOpts);
          const hasDistinctAvatar = Boolean(fullMember?.avatar && fullMember.avatar !== user.avatar);

          const sortedRoles = fullMember
            ? Array.from(
                fullMember.roles.cache
                  .filter((r) => r.id !== guild.id)
                  .sort((a, b) => b.position - a.position)
                  .values()
              ).map((r) => `<@&${r.id}>`)
            : [];
          const perms = fullMember ? fullMember.permissions.toArray().sort().map(formatPermName) : [];

          const baseOptions = [
            { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
            ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
            ...(guild
              ? [
                  { label: "Roles", value: "roles", description: "Roles del usuario" },
                  { label: "Permisos", value: "permissions", description: "Permisos del usuario" },
                ]
              : []),
          ];

          const getTabItems = (tab) => (tab === "roles" ? sortedRoles : tab === "permissions" ? perms : []);

          const renderView = ({ state, view, isEnded }) => {
            let builder;
            if (state.tab === "avatar") {
              const title = hasDistinctAvatar
                ? state.avType === "server"
                  ? "Avatar del servidor"
                  : "Avatar global"
                : "Avatar";
              const imageUrl = state.avType === "server" ? serverAvatar : globalAvatar;
              builder = buildUserImageCard(user, { title, imageUrl, color: colorRol });
            } else if (state.tab === "banner") {
              builder = buildUserImageCard(user, { title: "Banner", imageUrl: getBannerUrl(), color: colorRol });
            } else if (state.tab === "roles" || state.tab === "permissions") {
              const items = getTabItems(state.tab);
              const sliced = slicePage(items, state.pageIndex, PAGE_SIZE);
              const controls = !isEnded && sliced.totalPages > 1
                ? [
                    { label: "◀", customId: view.id("page", "prev"), style: "secondary", disabled: sliced.pageIndex <= 0 },
                    { label: "▶", customId: view.id("page", "next"), style: "secondary", disabled: sliced.pageIndex >= sliced.totalPages - 1 },
                  ]
                : null;
              builder = state.tab === "roles"
                ? buildRolesCard(fullMember, user, sliced.items, sliced.pageIndex, sliced.totalPages, { controls })
                : buildPermsCard(user, sliced.items, sliced.pageIndex, sliced.totalPages, colorRol, { controls });
            } else {
              builder = buildUserInfoCard({ user, member: fullMember, color: colorRol });
            }

            if (!isEnded) {
              addNavSelect(builder, view.id("select"), state.tab !== "info", baseOptions);
              if (state.tab === "avatar" && hasDistinctAvatar) {
                builder.addSpacer("small").addSelectMenu({
                  customId: view.id("avtype"),
                  placeholder: "Tipo de avatar...",
                  options: [
                    { label: "Avatar del Servidor", value: "server", description: "Avatar de servidor" },
                    { label: "Avatar Global", value: "global", description: "Avatar global" },
                  ],
                });
              }
            }

            return builder;
          };

          const userView = new V2View({
            authorId: invoker.id,
            timeout: 5 * 60_000,
            thirdPartyMode: "ephemeral-view",
            onEnd: "static",
            state: { tab: "info", avType: "server", pageIndex: 0 },
            render: renderView,
            renderStatic: (args) => renderView({ ...args, isEnded: true }),
            actions: {
              select: async ({ values, interaction, setState }) => {
                const selected = values[0];
                if (!selected) return false;

                if (selected === "banner" && !getBannerUrl()) {
                  await interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral }).catch(() => {});
                  return false;
                }
                if (selected === "roles" && !sortedRoles.length) {
                  await interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral }).catch(() => {});
                  return false;
                }
                if (selected === "permissions" && !perms.length) {
                  await interaction.reply({ content: "Este usuario no tiene permisos", flags: MessageFlags.Ephemeral }).catch(() => {});
                  return false;
                }

                setState({ tab: selected, pageIndex: 0 });
              },
              avtype: ({ values, setState }) => {
                if (!values[0]) return false;
                setState({ avType: values[0] });
              },
              page: ({ parts, state, setState }) => {
                const items = getTabItems(state.tab);
                const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
                const delta = parts[0] === "prev" ? -1 : 1;
                const next = Math.max(0, Math.min(totalPages - 1, state.pageIndex + delta));
                setState({ pageIndex: next });
              },
            },
          });

          await userView.send(ctx);
        } catch (err) {
          log.error("Error en user info", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "avatar", description: "Muestra el avatar de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        await ctx.defer();
        try {
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.member?.user;
          let user;
          let member = null;

          if (ctx.guild) {
            member = await resolveMember(ctx, input);
            if (!member) return ctx.send("No pude encontrar al usuario");
            user = member.user;
          } else {
            user = await resolveUser(ctx, input);
            if (!user) return ctx.send("No pude encontrar al usuario");
          }

          const avatarOpts = { extension: "png", size: 4096 };
          const serverAvatar = member ? member.displayAvatarURL(avatarOpts) : user.displayAvatarURL(avatarOpts);
          const globalAvatar = user.displayAvatarURL(avatarOpts);
          const hasDistinct = Boolean(member?.avatar && member.avatar !== user.avatar);
          const color = getMemberColor(member, member ? DARK : RED);

          if (!hasDistinct) {
            return ctx.send(buildUserImageCard(user, { title: "Avatar", imageUrl: serverAvatar, color }));
          }

          const renderAvatar = ({ state, view, isEnded }) => {
            const builder = buildUserImageCard(user, {
              title: state.type === "server" ? "Avatar del servidor" : "Avatar global",
              imageUrl: state.type === "server" ? serverAvatar : globalAvatar,
              color,
            });
            if (!isEnded) {
              builder.addSpacer("small").addSelectMenu({
                customId: view.id("select"),
                placeholder: "Tipo de avatar...",
                options: [
                  { label: "Avatar del Servidor", description: "Avatar de servidor", value: "server" },
                  { label: "Avatar Global", description: "Avatar global", value: "global" },
                ],
              });
            }
            return builder;
          };

          const avatarView = new V2View({
            authorId: invoker.id,
            timeout: 60_000,
            thirdPartyMode: "ephemeral-view",
            onEnd: "static",
            state: { type: "server" },
            render: renderAvatar,
            renderStatic: (args) => renderAvatar({ ...args, isEnded: true }),
            actions: {
              select: ({ values, setState }) => {
                if (!values[0]) return false;
                setState({ type: values[0] });
              },
            },
          });

          await avatarView.send(ctx);
        } catch (err) {
          log.error("Error en user avatar", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "banner", description: "Muestra el banner de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        await ctx.defer();
        try {
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.member?.user;
          let user;
          let member = null;

          if (ctx.guild) {
            member = await resolveMember(ctx, input);
            if (!member) return ctx.send("No pude encontrar al usuario");
            user = await member.user.fetch(true).catch(() => member.user);
            member = await member.fetch(true).catch(() => member);
          } else {
            user = await resolveUser(ctx, input);
            if (!user) return ctx.send("No pude encontrar al usuario");
            user = await user.fetch(true).catch(() => user);
          }

          const serverBannerURL = member?.bannerURL?.({ size: 4096 }) ?? null;
          const globalBannerURL = user.bannerURL({ size: 4096 });
          if (!globalBannerURL && !serverBannerURL) return ctx.send("Este usuario no tiene banner");

          const hasDistinct = Boolean(serverBannerURL && globalBannerURL && serverBannerURL !== globalBannerURL);
          const color = getMemberColor(member, member ? DARK : RED);
          const initialType = serverBannerURL ? "server" : "global";

          if (!hasDistinct) {
            return ctx.send(buildUserImageCard(user, { title: "Banner", imageUrl: serverBannerURL || globalBannerURL, color }));
          }

          const renderBanner = ({ state, view, isEnded }) => {
            const isServer = state.type === "server";
            const builder = buildUserImageCard(user, {
              title: isServer ? "Banner del servidor" : "Banner global",
              imageUrl: isServer ? serverBannerURL : globalBannerURL,
              color,
            });
            if (!isEnded) {
              builder.addSpacer("small").addSelectMenu({
                customId: view.id("select"),
                placeholder: "Tipo de banner...",
                options: [
                  { label: "Banner del Servidor", description: "Banner de servidor", value: "server" },
                  { label: "Banner Global", description: "Banner global", value: "global" },
                ],
              });
            }
            return builder;
          };

          const bannerView = new V2View({
            authorId: invoker.id,
            timeout: 60_000,
            thirdPartyMode: "ephemeral-view",
            onEnd: "static",
            state: { type: initialType },
            render: renderBanner,
            renderStatic: (args) => renderBanner({ ...args, isEnded: true }),
            actions: {
              select: ({ values, setState }) => {
                if (!values[0]) return false;
                setState({ type: values[0] });
              },
            },
          });

          await bannerView.send(ctx);
        } catch (err) {
          log.error("Error en user banner", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "roles", description: "Muestra los roles de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        await ctx.defer();
        try {
          if (!ctx.guild) return noGuildReply(ctx);
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.member?.user;
          const member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");

          const user = member.user;
          const allRoles = member.roles.cache
            .filter((r) => r.id !== ctx.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((r) => `<@&${r.id}>`);

          if (!allRoles.length) return ctx.send("Este usuario no tiene roles");

          const paginator = new V2Paginator({
            items: allRoles,
            perPage: PAGE_SIZE,
            ownerId: invoker.id,
            thirdPartyMode: "reject",
            thirdPartyMessage: "No es tu comando",
            wrap: false,
            prevButton: { label: "◀" },
            nextButton: { label: "▶" },
            showPageIndicator: false,
            timeout: 2 * 60_000,
            renderPage: ({ items: pageItems, pageIndex, totalPages, isEnded, controls }) =>
              buildRolesCard(member, user, pageItems, pageIndex, totalPages, {
                controls: !isEnded && totalPages > 1 ? controls : null,
              }),
          });

          await paginator.send(ctx);
        } catch (err) {
          log.error("Error en user roles", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "permissions", description: "Muestra los permisos de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

      async code(ctx) {
        await ctx.defer();
        try {
          if (!ctx.guild) return noGuildReply(ctx);
          const input = ctx.get("usuario") ?? null;
          const invoker = ctx.user ?? ctx.member?.user;
          const member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");

          const user = member.user;
          const color = getMemberColor(member, DARK);
          const perms = member.permissions.toArray().sort().map(formatPermName);

          if (!perms.length) return ctx.send("Este usuario no tiene permisos");

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
            timeout: 2 * 60_000,
            renderPage: ({ items: pageItems, pageIndex, totalPages, isEnded, controls }) =>
              buildPermsCard(user, pageItems, pageIndex, totalPages, color, {
                controls: !isEnded && totalPages > 1 ? controls : null,
              }),
          });

          await paginator.send(ctx);
        } catch (err) {
          log.error("Error en user permissions", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "random",
        description: "Elige a un miembro del servidor al azar",
      }),
      params: new ParamsBuilder().addRole({
        name: "rol",
        description: "Filtrar entre miembros de un rol específico (opcional)",
        required: false,
      }),

      async code(ctx) {
        await ctx.defer();
        try {
          if (!ctx.guild) return noGuildReply(ctx);

          const role = ctx.get("rol") ?? null;
          if (ctx.guild.memberCount !== ctx.guild.members.cache.size) {
            await ctx.guild.members.fetch().catch(() => {});
          }

          let pool = ctx.guild.members.cache;
          if (role) {
            pool = pool.filter((m) => m.roles.cache.has(role.id));
          }

          const humans = pool.filter((m) => !m.user.bot);
          const candidates = humans.size > 0 ? humans : pool;

          if (!candidates.size) {
            return ctx.ephemeral(
              role ? `No hay miembros con el rol ${role}` : "No se encontraron miembros en el servidor"
            );
          }

          const chosen = candidates.random();
          const user = chosen.user;
          const color = getMemberColor(chosen, RED);
          const joinedTs = chosen.joinedTimestamp ? Math.floor(chosen.joinedTimestamp / 1000) : null;

          const card = new ComponentsV2Builder({ color }).addSection(
            [
              V2Text.heading("Usuario al azar", 3),
              V2Text.fields([
                ["Seleccionado", `${chosen} (${V2Text.code(user.username)})`],
                ["ID", V2Text.code(user.id)],
                role ? ["Rol filtrado", `${role}`] : null,
                joinedTs ? ["Ingreso", `<t:${joinedTs}:R>`] : null,
              ]),
            ],
            { thumbnail: chosen.displayAvatarURL({ size: 1024 }) }
          );

          await ctx.send(card);
        } catch (err) {
          log.error("Error en user random", { err: err?.message ?? String(err) });
          return handleCommandError(ctx, err);
        }
      },
    }),
};

module.exports = { data };
