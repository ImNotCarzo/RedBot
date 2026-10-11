const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, max = 1024) => {
  const str = String(s ?? "");
  return str.length > max ? `${str.slice(0, max - 1)}…` : str || "-";
};

const activeBroadcasts = new Set();

async function sendWithRetry(miembro, payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await miembro.send(payload);
      return true;
    } catch (err) {
      if (err?.status === 429) {
        await sleep((err?.rawError?.retry_after ?? 2) * 1000);
        continue;
      }
      return false;
    }
  }
  return false;
}

/**
 * Envía `embed` por DM a los miembros del servidor aplicando filtros.
 * Impide dos envíos simultáneos en el mismo servidor.
 * Devuelve { enviados, fallidos } o null si ya hay un envío en curso.
 */
async function broadcastDm({ guild, embed, soloRolId, excluirRolId, excluirUserId, onProgress }) {
  if (activeBroadcasts.has(guild.id)) return null;
  activeBroadcasts.add(guild.id);

  try {
    await guild.members.fetch();

    const members = [...guild.members.cache.values()].filter((m) => {
      if (m.user.bot) return false;
      if (soloRolId && !m.roles.cache.has(soloRolId)) return false;
      if (excluirRolId && m.roles.cache.has(excluirRolId)) return false;
      if (excluirUserId && m.id === excluirUserId) return false;
      return true;
    });

    const total = members.length;
    await onProgress?.(0, total);

    let enviados = 0;
    let fallidos = 0;

    for (let i = 0; i < total; i++) {
      if (await sendWithRetry(members[i], { embeds: [embed] })) enviados++;
      else fallidos++;

      await sleep(500);
      if (i % 10 === 0) await onProgress?.(i + 1, total);
    }

    return { enviados, fallidos, total };
  } finally {
    activeBroadcasts.delete(guild.id);
  }
}

function buildDmAllLogEmbed({ author, enviados, fallidos, titulo, texto, filtros }) {
  return new EmbedBuilder()
    .setTitle("DM masivo enviado")
    .setColor(RED)
    .addFields(
      { name: "Moderador", value: author.tag ?? author.username, inline: true },
      { name: "Enviados", value: `\`${enviados}\``, inline: true },
      { name: "Fallidos", value: `\`${fallidos}\``, inline: true },
      { name: "Título", value: clip(titulo), inline: false },
      { name: "Texto", value: clip(texto), inline: false },
      ...(filtros.length ? [{ name: "Filtros", value: clip(filtros.join("\n")), inline: false }] : []),
    )
    .setTimestamp();
}

function buildDmAllEmbed({ titulo, texto, author, guild, imagenUrl }) {
  const avatarUrl = author.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
  const embed = new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(texto)
    .setColor(RED)
    .setFooter({ text: `att: ${author.globalName ?? author.username}`, iconURL: avatarUrl })
    .setThumbnail(guild.iconURL({ size: 512 }));
  if (imagenUrl) embed.setImage(imagenUrl);
  return embed;
}

module.exports = { broadcastDm, buildDmAllEmbed, buildDmAllLogEmbed };
