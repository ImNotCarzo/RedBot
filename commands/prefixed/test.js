const {
  CommandBuilder,
  ParamsBuilder,
} = require("gralonium");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

// ======================================================
// CONFIG
// ======================================================

const SERVERS_PER_PAGE = 20;

// ======================================================
// MENSAJES DE REDBOT
// ======================================================
//
// IMPORTANTE:
// Discord NO proporciona un contador histórico de mensajes
// enviados por un bot.
//
// Esta función debe consultar tu MongoDB.
//
// Ejemplo esperado:
//
// await getBotMessageCount(guild.id)
//
// => 1234
//
// Si todavía no tienes ese contador implementado,
// devuelve 0 temporalmente.
//

async function getBotMessageCount(guildId) {
  /*
    EJEMPLO:

    const GuildStats = require("../models/GuildStats");

    const stats = await GuildStats.findOne({
      guildId,
    }).lean();

    return stats?.botMessages || 0;
  */

  return 0;
}

// ======================================================
// OBTENER INFORMACIÓN DEL SERVIDOR
// ======================================================

async function getGuildInfo(guild) {
  let owner = null;

  try {
    owner = await guild.members.fetch(guild.ownerId);
  } catch {
    // El owner puede no estar disponible.
  }

  const messageCount = await getBotMessageCount(guild.id);

  return {
    name: guild.name,
    id: guild.id,
    members: guild.memberCount ?? 0,

    ownerName:
      owner?.user?.tag ||
      owner?.user?.username ||
      "Desconocido",

    ownerId: guild.ownerId || "Desconocido",

    botMessages: messageCount,
  };
}

// ======================================================
// EMBED
// ======================================================

function buildEmbed(server, index, total) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 Servidor ${index + 1}`)
    .setDescription(`Información de **${server.name}**`)
    .addFields(
      {
        name: "🏠 Servidor",
        value:
          `**${server.name}**\n` +
          `\`${server.id}\``,
        inline: false,
      },
      {
        name: "👥 Miembros",
        value: `**${server.members.toLocaleString()}**`,
        inline: true,
      },
      {
        name: "👑 Dueño",
        value: `**${server.ownerName}**`,
        inline: true,
      },
      {
        name: "🆔 ID del dueño",
        value: `\`${server.ownerId}\``,
        inline: false,
      },
      {
        name: "🤖 Mensajes de RedBot",
        value: `**${server.botMessages.toLocaleString()}**`,
        inline: true,
      }
    )
    .setFooter({
      text: `Servidor ${index + 1} de ${total}`,
    })
    .setTimestamp();

  if (server.icon) {
    embed.setThumbnail(server.icon);
  }

  return embed;
}

// ======================================================
// BOTONES
// ======================================================

function buildButtons(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("redbot_servers_prev")
      .setLabel("Anterior")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),

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
      .setDisabled(page >= totalPages - 1)
  );
}

// ======================================================
// COMANDO
// ======================================================

const data = {
  data: new CommandBuilder({
    name: "servers",
    description: "Muestra los servidores donde está RedBot",
    as_prefix: true,
    as_slash: true,
  }),

  params: new ParamsBuilder(),

  async code(ctx) {
    // ==================================================
    // CLIENT
    // ==================================================

    const client = ctx.bot;

    if (!client) {
      return ctx.send("❌ No pude acceder al cliente de Discord.");
    }

    // ==================================================
    // OBTENER SERVIDORES
    // ==================================================

    const guilds = [...client.guilds.cache.values()];

    if (!guilds.length) {
      return ctx.send("❌ RedBot no está en ningún servidor.");
    }

    // Ordenar por cantidad de miembros, de mayor a menor.
    guilds.sort(
      (a, b) =>
        (b.memberCount || 0) -
        (a.memberCount || 0)
    );

    // ==================================================
    // CARGAR INFORMACIÓN
    // ==================================================

    const servers = [];

    for (const guild of guilds) {
      try {
        const info = await getGuildInfo(guild);

        // Guardamos icono por separado para el embed.
        info.icon = guild.iconURL({
          size: 256,
          extension: "png",
        });

        servers.push(info);
      } catch (error) {
        console.error(
          `[SERVERS] Error obteniendo ${guild.id}:`,
          error
        );

        servers.push({
          name: guild.name,
          id: guild.id,
          members: guild.memberCount || 0,
          ownerName: "Desconocido",
          ownerId: guild.ownerId || "Desconocido",
          botMessages: 0,
          icon: guild.iconURL({
            size: 256,
            extension: "png",
          }),
        });
      }
    }

    // ==================================================
    // PAGINACIÓN
    // ==================================================

    let page = 0;

    const totalPages = Math.max(
      1,
      Math.ceil(servers.length / SERVERS_PER_PAGE)
    );

    function getPageServers() {
      const start = page * SERVERS_PER_PAGE;

      return servers.slice(
        start,
        start + SERVERS_PER_PAGE
      );
    }

    function buildPageEmbed() {
      const pageServers = getPageServers();

      const startIndex =
        page * SERVERS_PER_PAGE;

      const embed = new EmbedBuilder()
        .setTitle("🤖 RedBot — Servidores")
        .setDescription(
          `RedBot está actualmente en **${servers.length.toLocaleString()} servidores**.\n\n` +
          `Mostrando servidores **${startIndex + 1}–${Math.min(
            startIndex + SERVERS_PER_PAGE,
            servers.length
          )}**.`
        )
        .setFooter({
          text: `Página ${page + 1} de ${totalPages}`,
        })
        .setTimestamp();

      for (let i = 0; i < pageServers.length; i++) {
        const server = pageServers[i];

        const number = startIndex + i + 1;

        embed.addFields({
          name: `${number}. ${server.name}`,
          value:
            `👥 **${server.members.toLocaleString()}** miembros\n` +
            `👑 ${server.ownerName}\n` +
            `🆔 \`${server.ownerId}\`\n` +
            `🤖 **${server.botMessages.toLocaleString()}** mensajes de RedBot\n` +
            `🏠 ID: \`${server.id}\``,
          inline: false,
        });
      }

      return embed;
    }

    // ==================================================
    // RESPUESTA INICIAL
    // ==================================================

    const message = await ctx.send({
      embeds: [buildPageEmbed()],
      components: [
        buildButtons(page, totalPages),
      ],
    });

    if (!message) return;

    // ==================================================
    // COLLECTOR
    // ==================================================

    const collector =
      message.createMessageComponentCollector({
        time: 5 * 60 * 1000,
      });

    collector.on("collect", async (interaction) => {
      // Solo quien ejecutó el comando puede usar
      // los botones.
      if (interaction.user.id !== ctx.user?.id) {
        return interaction.reply({
          content:
            "❌ Estos botones no son para ti.",
          ephemeral: true,
        });
      }

      // ==================================================
      // ANTERIOR
      // ==================================================

      if (
        interaction.customId ===
        "redbot_servers_prev"
      ) {
        if (page > 0) {
          page--;
        }
      }

      // ==================================================
      // SIGUIENTE
      // ==================================================

      if (
        interaction.customId ===
        "redbot_servers_next"
      ) {
        if (page < totalPages - 1) {
          page++;
        }
      }

      await interaction.update({
        embeds: [buildPageEmbed()],
        components: [
          buildButtons(page, totalPages),
        ],
      });
    });

    // ==================================================
    // CUANDO TERMINA EL COLLECTOR
    // ==================================================

    collector.on("end", async () => {
      try {
        await message.edit({
          components: [
            buildButtons(page, totalPages).setComponents(
              buildButtons(page, totalPages).components.map(
                (button) => {
                  return ButtonBuilder.from(button).setDisabled(true);
                }
              )
            ),
          ],
        });
      } catch {
        // El mensaje pudo haber sido eliminado.
      }
    });
  },
};

module.exports = { data };
