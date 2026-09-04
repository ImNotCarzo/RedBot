const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────

const SERVERS_PER_PAGE = 20;
const COLLECTOR_TIMEOUT = 5 * 60 * 1000;

// ──────────────────────────────────────────────
// CONTADOR DE MENSAJES DEL BOT
//
// Consulta tu base de datos aquí.
// Debe devolver un número (e.g. 1234).
//
// Ejemplo con MongoDB:
//
//   const stats = await GuildStats.findOne({ guildId }).lean();
//   return stats?.botMessages ?? 0;
// ──────────────────────────────────────────────

async function getBotMessageCount(guildId) {
  return 0;
}

// ──────────────────────────────────────────────
// DATOS DE UN SERVIDOR
// ──────────────────────────────────────────────

async function getGuildInfo(guild) {
  let owner = null;

  try {
    owner = await guild.members.fetch(guild.ownerId);
  } catch {
    // El owner puede no estar en caché.
  }

  return {
    name: guild.name,
    id: guild.id,
    members: guild.memberCount ?? 0,
    ownerName: owner?.user?.tag ?? owner?.user?.username ?? "Desconocido",
    ownerId: guild.ownerId ?? "Desconocido",
    botMessages: await getBotMessageCount(guild.id),
    icon: guild.iconURL({ size: 256, extension: "png" }),
  };
}

// ──────────────────────────────────────────────
// EMBED DE PÁGINA
// ──────────────────────────────────────────────

function buildPageEmbed(servers, page, totalPages) {
  const SERVERS_PER_PAGE = 20;
  const start = page * SERVERS_PER_PAGE;
  const pageServers = servers.slice(start, start + SERVERS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle("🤖 RedBot — Servidores")
    .setDescription(
      `RedBot está en **${servers.length.toLocaleString()} servidores**.\n` +
      `Mostrando **${start + 1}–${Math.min(start + SERVERS_PER_PAGE, servers.length)}**.`
    )
    .setFooter({ text: `Página ${page + 1} de ${totalPages}` })
    .setTimestamp();

  for (let i = 0; i < pageServers.length; i++) {
    const s = pageServers[i];
    embed.addFields({
      name: `${start + i + 1}. ${s.name}`,
      value:
        `👥 **${s.members.toLocaleString()}** miembros\n` +
        `👑 ${s.ownerName} — \`${s.ownerId}\`\n` +
        `🤖 **${s.botMessages.toLocaleString()}** msgs de RedBot\n` +
        `🏠 \`${s.id}\``,
      inline: false,
    });
  }

  return embed;
}

// ──────────────────────────────────────────────
// BOTONES DE PAGINACIÓN
// ──────────────────────────────────────────────

function buildButtons(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("redbot_servers_prev")
      .setLabel("Anterior")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 0),

    new ButtonBuilder()
      .setCustomId("redbot_servers_page")
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),

    new ButtonBuilder()
      .setCustomId("redbot_servers_next")
      .setLabel("Siguiente")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages - 1)
  );
}

// ──────────────────────────────────────────────
// COMANDO
// ──────────────────────────────────────────────

const data = {
  data: new CommandBuilder({
    name: "servers",
    description: "Muestra los servidores donde está RedBot",
    as_prefix: true,
    as_slash: true,
  }),

  params: new ParamsBuilder(),

  async code(ctx) {
    const client = ctx.bot;

    if (!client) {
      return ctx.send("❌ No pude acceder al cliente de Discord.");
    }

    // Capturar el ID del autor UNA sola vez antes del collector.
    // Ajusta esta línea según tu versión de gralonium:
    //   ctx.author?.id  /  ctx.user?.id  /  ctx.member?.id
    const authorId = ctx.author?.id ?? ctx.user?.id;

    // ── Obtener y ordenar servidores ──────────────

    const guilds = [...client.guilds.cache.values()].sort(
      (a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0)
    );

    if (!guilds.length) {
      return ctx.send("❌ RedBot no está en ningún servidor.");
    }

    // ── Cargar información de cada servidor ───────

    const servers = await Promise.all(
      guilds.map(async (guild) => {
        try {
          return await getGuildInfo(guild);
        } catch (error) {
          console.error(`[servers] Error en guild ${guild.id}:`, error);
          return {
            name: guild.name,
            id: guild.id,
            members: guild.memberCount ?? 0,
            ownerName: "Desconocido",
            ownerId: guild.ownerId ?? "Desconocido",
            botMessages: 0,
            icon: guild.iconURL({ size: 256, extension: "png" }),
          };
        }
      })
    );

    // ── Paginación ────────────────────────────────

    let page = 0;
    const totalPages = Math.max(1, Math.ceil(servers.length / SERVERS_PER_PAGE));

    const message = await ctx.send({
      embeds: [buildPageEmbed(servers, page, totalPages)],
      components: [buildButtons(page, totalPages)],
    });

    if (!message) return;

    // ── Collector de botones ──────────────────────

    const collector = message.createMessageComponentCollector({
      time: COLLECTOR_TIMEOUT,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== authorId) {
        return interaction.reply({
          content: "❌ Estos botones no son para ti.",
          ephemeral: true,
        });
      }

      if (interaction.customId === "redbot_servers_prev" && page > 0) page--;
      if (interaction.customId === "redbot_servers_next" && page < totalPages - 1) page++;

      await interaction.update({
        embeds: [buildPageEmbed(servers, page, totalPages)],
        components: [buildButtons(page, totalPages)],
      });
    });

    collector.on("end", async () => {
      try {
        await message.edit({
          components: [buildButtons(page, totalPages, true)],
        });
      } catch {
        // El mensaje pudo haber sido eliminado.
      }
    });
  },
};

module.exports = { data };
