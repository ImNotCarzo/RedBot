const { CommandBuilder } = require("gralonium");
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

// ─────────────────────────────────────────────
//  COMANDO
// ─────────────────────────────────────────────

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

    if (!raw) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando DM All", iconURL: bot.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nEnvía un embed por DM a todos los miembros del servidor` +
              `\n\n**Aliases:**\n\`dmall\`, \`dmeveryone\`` +
              `\n\n\`\`\`js\n.dmall titulo,texto\nEjemplo: .dmall Hoy jugamos,go ofi\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    const sep    = raw.indexOf(",");
    const titulo = sep !== -1 ? raw.slice(0, sep).trim() : raw.trim();
    const texto  = sep !== -1 ? raw.slice(sep + 1).trim() : "";

    if (!titulo || !texto) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando DM", iconURL: bot.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nEnvía un embed por DM a todos los miembros del servidor` +
              `\n\n**Aliases:**\n\`dmall\`, \`dmeveryone\`` +
              `\n\n\`\`\`js\n.dmall titulo,texto\nEjemplo: .dmall Hoy jugamos,go ofi\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

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

    const members = [...guild.members.cache.values()].filter((m) => !m.user.bot);
    const total   = members.length;

    const progressMsg = await ctx.send(`enviando... 0/${total}`);

    let enviados = 0;
    let fallidos = 0;

    for (let i = 0; i < members.length; i++) {
      const ok = await sendWithRetry(members[i], { embeds: [embed] });
      if (ok) enviados++; else fallidos++;

      await sleep(800);

      if (i % 10 === 0) {
        await progressMsg.edit(`enviando... ${i + 1}/${total}`).catch(() => null);
      }
    }

    const logEmbed = new EmbedBuilder()
      .setTitle("DM masivo enviado")
      .setColor(RED)
      .addFields(
        { name: "Moderador", value: author.tag ?? author.username, inline: true },
        { name: "Enviados",  value: `\`${enviados}\``,             inline: true },
        { name: "Fallidos",  value: `\`${fallidos}\``,             inline: true },
        { name: "Título",    value: titulo,                         inline: false },
        { name: "Texto",     value: texto,                          inline: false },
      )
      .setTimestamp();

    await sendLog(guild, logEmbed);

    return progressMsg.edit(`hecho\nEnviados: **${enviados}**\nFallidos: **${fallidos}**`);
  },
};

module.exports = { data };
