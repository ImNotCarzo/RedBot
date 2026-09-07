const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { resolveMemberFlexible } = require("../../../src/adapter");
const { buildPaginationRow, paginateArray, formatPermissionName, uniqueCollectorId } = require("../../_shared/runtime");

async function resolveMember(ctx, input) {
  return resolveMemberFlexible(ctx, input);
}

async function resolveUser(ctx, input) {
  const invoker = ctx.user ?? ctx.author;
  if (!input) return invoker ?? null;
  if (typeof input === "object") return input.user ?? input;
  const id = String(input).replace(/\D/g, "");
  if (id) return ctx.bot.users.fetch(id).catch(() => null);
  return null;
}

function buildRolesEmbed(member, user, username, roles, page, totalPages) {
  const numbered = roles.map((r, i) => `${page * 15 + i + 1}. ${r}`);
  const embed = new EmbedBuilder()
    .setAuthor({ name: username, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(numbered.join("\n"))
    .setColor(member.displayHexColor || "#2b2d31")
    .setTimestamp();
  if (totalPages > 1) embed.setFooter({ text: `Página ${page + 1}/${totalPages}` });
  return embed;
}

function buildPermsEmbed(user, perms, page, totalPages, color) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: `Permisos de ${user.username}`, iconURL: user.displayAvatarURL({ size: 128 }) })
    .setDescription(perms.join("\n"))
    .setColor(color || "#2b2d31")
    .setTimestamp();
  if (totalPages > 1) embed.setFooter({ text: `Página ${page + 1}/${totalPages}` });
  return embed;
}

function makeSelectRow(customId, includeInfo, options) {
  const opts = (includeInfo
    ? [{ label: "Info", value: "info", description: "Información del usuario" }, ...options]
    : options
  ).map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.description));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder("Navegar...").addOptions(opts)
  );
}

function createCollectorManager() {
  const active = new Map();
  return {
    set(name, collector) {
      this.stop(name);
      active.set(name, collector);
      collector.once("end", () => active.delete(name));
    },
    stop(name) {
      active.get(name)?.stop();
      active.delete(name);
    },
    stopAll() {
      active.forEach((c) => c.stop());
      active.clear();
    },
  };
}

function buildExtendedFields(member, user) {
  const fields = [];

  const pg = user.primaryGuild;
  if (pg?.tag) {
    const badgeURL = user.guildTagBadgeURL({ size: 4096 });
    fields.push({
      name: "Guild Tag",
      value:
        `> **Tag:** \`${pg.tag}\`\n` +
        `> **ID del servidor:** \`${pg.identityGuildId ?? "N/A"}\`\n` +
        `> ${badgeURL ? `**[Insignia](${badgeURL})**` : "Sin insignia"}`,
    });
  }

  const memberDecData = member?.avatarDecorationData ?? null;
  const userDecData = user.avatarDecorationData ?? null;
  const activeDecData = memberDecData ?? userDecData;

  const avatarDecURL = member
    ? member.displayAvatarDecorationURL?.({ size: 4096 }) ?? user.avatarDecorationURL?.({ size: 4096 })
    : user.avatarDecorationURL?.({ size: 4096 });

  const nameplate = user.collectibles?.nameplate ?? null;

  const decoLines = [];
  if (activeDecData) {
    const decName = activeDecData.skuId ?? "Decoración de avatar";
    const decLine = avatarDecURL ? `[${decName}](${avatarDecURL})` : decName;
    decoLines.push(`> **Avatar:** ${decLine}`);
  }
  if (nameplate) {
    const plateName = nameplate.label || nameplate.skuId || "Placa de nombre";
    const plateLink = nameplate.skuId
      ? `[${plateName}](https://discord.com/shop#itemSkuId=${nameplate.skuId})`
      : plateName;
    decoLines.push(`> **Placa:** ${plateLink}`);
  }
  if (decoLines.length) {
    fields.push({ name: "Decoraciones", value: decoLines.join("\n") });
  }

  return fields;
}

module.exports = {
  resolveMember,
  resolveUser,
  buildRolesEmbed,
  buildPermsEmbed,
  buildPaginationRow,
  makeSelectRow,
  uniqueId: uniqueCollectorId,
  formatPermName: formatPermissionName,
  paginateArray,
  createCollectorManager,
  buildExtendedFields,
};
