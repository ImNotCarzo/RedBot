const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");
const sendLog = require("../../src/services/logging.service");

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendWithRetry(miembro, payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await miembro.send(payload);
      return true;
    } catch (err) {
      if (err?.status === 429) {
        const wait = (err?.rawError?.retry_after ?? 2) * 1000;
        await sleep(wait);
        continue;
      }
      return false;
    }
  }
  return false;
}
function parseArgs(raw) {
  let str    = raw;
  let soloId = null;
  let rolId  = null;
  let userId = null;

  const soloMatch = str.match(/--solo\s+(?:<@&)?(\d+)>?/);
  const rolMatch  = str.match(/--rol\s+(?:<@&)?(\d+)>?/);
  const userMatch = str.match(/--user\s+(?:<@!?)?(\d+)>?/);

  if (soloMatch) { soloId = soloMatch[1]; str = str.replace(soloMatch[0], "").trim(); }
  if (rolMatch)  { rolId  = rolMatch[1];  str = str.replace(rolMatch[0],  "").trim(); }
  if (userMatch) { userId = userMatch[1]; str = str.replace(userMatch[0], "").trim(); }

  const sep    = str.indexOf(",");
  const titulo = sep !== -1 ? str.slice(0, sep).trim() : str.trim();
  const texto  = sep !== -1 ? str.slice(sep + 1).trim() : "";

  return { titulo, texto, soloId, rolId, userId };
}
// ─────────────────────────────────────────────
//  COMANDO
// ─────────────────────────────────────────────

const PARAMERROR = (bot) => ({
  embeds: [
    new EmbedBuilder()
      .setAuthor({ name: "Comando DM All", iconURL: bot.displayAvatarURL() })
      .setDescription(
        `**Usos:**\nEnvía un embed por DM a todos los miembros del servidor` +
        `\n\n**Aliases:**\n\`dmall\`, \`dmeveryone\`` +
        `\n\n\`\`\`js\n.dm titulo,texto --solo <@rol> --rol <@rol> --user <@user> \n\n` +
        `Ejemplo base:         
        .dm Hoy jugamos, go ofi \n` +
        `Solo un rol:
        .dm Hoy jugamos,solo los gokianos --solo @gokianos\n` +
        `Excluir rol:
        .dm Hoy jugamos,menos los malos --rol @malos\n` +
        `Excluir usuario:
        .dm Hoy jugamos,todos menos el mamon --user @loge\n` +
        `Todo:
        .dm Hoy jugamos, solo los gokianos que no son malos ni mamones --solo @gokianos --rol @malos --user @loge\`\`\``
      )
      .setColor(RED),
  ],
});

const data = {
  data: new CommandBuilder({
    name: "dmall",
    description: "Envía un DM con embed a todos los miembros del servidor",
    aliases: ["dm", "dmerveryone"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const bot = ctx.bot.user;
    const raw = ctx.args?.join(" ").trim();

    if (!raw) return ctx.send(PARAMERROR(bot));

    const { titulo, texto, soloId, rolId, userId } = parseArgs(raw);

    if (!titulo || !texto) return ctx.send(PARAMERROR(bot));

    const member = ctx.member;
    if (!member?.permissions.has("Administrator")) return ctx.send("f");

    const guild = ctx.guild;
    if (!guild) return ctx.send("f");

    const author    = ctx.author;
    const avatarUrl = author.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });

    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(texto)
      .setColor(RED)
      .setFooter({ text: `att: ${author.globalName ?? author.username}`, iconURL: avatarUrl })
      .setThumbnail(guild.iconURL({ size: 512 }));

    await guild.members.fetch();

    const members = [...guild.members.cache.values()].filter((m) => {
      if (m.user.bot) return false;
      if (soloId && !m.roles.cache.has(soloId))  return false;
      if (rolId  &&  m.roles.cache.has(rolId))   return false;
      if (userId &&  m.id === userId)             return false;
      return true;
    });

    const total       = members.length;
    const progressMsg = await ctx.send(`enviando... 0/${total}`);

    let enviados = 0;
    let fallidos = 0;

    for (let i = 0; i < members.length; i++) {
      const ok = await sendWithRetry(members[i], { embeds: [embed] });
      if (ok) enviados++; else fallidos++;

      await sleep(500);

      if (i % 10 === 0) {
        await progressMsg.edit(`enviando... ${i + 1}/${total}`).catch(() => null);
      }
    }

    const exclusiones = [
      soloId ? `Solo rol: \`${soloId}\``            : null,
      rolId  ? `Rol excluido: \`${rolId}\``         : null,
      userId ? `Usuario excluido: \`${userId}\``    : null,
    ].filter(Boolean);

    const logEmbed = new EmbedBuilder()
      .setTitle("DM masivo enviado")
      .setColor(RED)
      .addFields(
        { name: "Moderador", value: author.tag ?? author.username, inline: true  },
        { name: "Enviados",  value: `\`${enviados}\``,             inline: true  },
        { name: "Fallidos",  value: `\`${fallidos}\``,             inline: true  },
        { name: "Título",    value: titulo,                         inline: false },
        { name: "Texto",     value: texto,                         inline: false },
        ...(exclusiones.length ? [{ name: "Filtros", value: exclusiones.join("\n"), inline: false }] : []),
      )
      .setTimestamp();

    await sendLog(guild, logEmbed);

    return progressMsg.edit(`hecho\nEnviados: **${enviados}**\nFallidos: **${fallidos}**`);
  },
};

module.exports = { data };
