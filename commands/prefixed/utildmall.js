const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");
const { sendLog } = require("../../src/guild");
const { broadcastDm, buildDmAllEmbed, buildDmAllLogEmbed } = require("../_shared/runtime");

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function parseArgs(raw) {
  let str    = raw;
  let soloId = null;
  let rolId  = null;
  let userId = null;
  let imagen = null;

  const soloMatch   = str.match(/--solo\s+(?:<@&)?(\d+)>?/);
  const rolMatch    = str.match(/--rol\s+(?:<@&)?(\d+)>?/);
  const userMatch   = str.match(/--user\s+(?:<@!?)?(\d+)>?/);
  const imagenMatch = str.match(/--imagen\s+(https?:\/\/\S+)/);

  if (soloMatch)   { soloId = soloMatch[1];   str = str.replace(soloMatch[0],   "").trim(); }
  if (rolMatch)    { rolId  = rolMatch[1];     str = str.replace(rolMatch[0],    "").trim(); }
  if (userMatch)   { userId = userMatch[1];    str = str.replace(userMatch[0],   "").trim(); }
  if (imagenMatch) { imagen = imagenMatch[1];  str = str.replace(imagenMatch[0], "").trim(); }

  const sep    = str.indexOf(",");
  const titulo = sep !== -1 ? str.slice(0, sep).trim() : str.trim();
  const texto  = sep !== -1 ? str.slice(sep + 1).trim() : "";

  return { titulo, texto, soloId, rolId, userId, imagen };
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
        `\n\`\`\`\n` +
        `.dm titulo,texto [--solo <@rol>] [--rol <@rol>] [--user <@user>] [--imagen <url>]\n` +
        `\n` +
        `Ejemplo base:\n` +
        `  .dm Hoy jugamos,go ofi\n` +
        `\n` +
        `Con imagen:\n` +
        `  .dm Hoy jugamos,miren esto --imagen https://i.imgur.com/abc.png\n` +
        `\n` +
        `Solo un rol:\n` +
        `  .dm Hoy jugamos,solo los gokianos --solo @gokianos\n` +
        `\n` +
        `Excluir rol:\n` +
        `  .dm Hoy jugamos,menos los malos --rol @malos\n` +
        `\n` +
        `Excluir usuario:\n` +
        `  .dm Hoy jugamos,todos menos el mamon --user @loge\n` +
        `\n` +
        `Todo:\n` +
        `  .dm Hoy jugamos,solo gokianos sin malos ni mamones --solo @gokianos --rol @malos --user @loge --imagen https://i.imgur.com/abc.png` +
        `\`\`\``
      )
      .setColor(RED),
  ],
});

const data = {
  data: new CommandBuilder({
    name: "dmall",
    description: "Envía un DM con embed a todos los miembros del servidor",
    aliases: ["dm", "dmeveryone", "dmerveryone"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    const bot = ctx.bot.user;
    const raw = ctx.args?.join(" ").trim();
    const member = ctx.member;
    if (!member?.permissions.has("Administrator")) return ctx.send("No tienes permisos para usar este comando, necesitas: `Administrator`");

    const guild = ctx.guild;
    if (!guild) return ctx.send("Este comando solo se puede usar en servidores");
    if (!raw) return ctx.send(PARAMERROR(bot));

    const { titulo, texto, soloId, rolId, userId, imagen: imagenUrl } = parseArgs(raw);

    if (!titulo || !texto) return ctx.send(PARAMERROR(bot));

    const author = ctx.author;

    // --imagen tiene prioridad; si no, usa el primer adjunto del mensaje
    const imagen = imagenUrl ?? ctx.message.attachments.first()?.url ?? null;
    const embed = buildDmAllEmbed({ titulo, texto, author, guild, imagenUrl: imagen });

    let progressMsg = null;
    const result = await broadcastDm({
      guild,
      embed,
      soloRolId: soloId,
      excluirRolId: rolId,
      excluirUserId: userId,
      onProgress: async (done, total) => {
        const text = `enviando... ${done}/${total}`;
        if (!progressMsg) progressMsg = await ctx.send(text);
        else await progressMsg.edit(text).catch(() => null);
      },
    });

    if (!result) return ctx.send("Ya hay un DM masivo en curso en este servidor, espera a que termine");

    const { enviados, fallidos } = result;
    const exclusiones = [
      soloId ? `Solo rol: \`${soloId}\`` : null,
      rolId  ? `Rol excluido: \`${rolId}\`` : null,
      userId ? `Usuario excluido: \`${userId}\`` : null,
    ].filter(Boolean);

    await sendLog(guild, buildDmAllLogEmbed({ author, enviados, fallidos, titulo, texto, filtros: exclusiones })).catch(() => null);

    return progressMsg.edit(`hecho\nEnviados: **${enviados}**\nFallidos: **${fallidos}**`).catch(() => null);
  },
};

module.exports = { data };
