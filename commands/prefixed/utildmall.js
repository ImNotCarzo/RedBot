const { CommandBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");
const sendLog = require("../../src/services/logging.service");

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

    // sin args → mostrar uso
    if (!raw) {
      return ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "Comando DM All", iconURL: bot.displayAvatarURL() })
            .setDescription(
              `**Usos:**\nEnvía un embed por DM a todos los miembros del servidor` +
              `\n\n**Aliases:**\n\`dm\`, \`dmeveryone\`` +
              `\n\n\`\`\`js\n.dmall titulo,texto\nEjemplo: .dmall Hoy jugamos,Nos vemos a las 22hs\`\`\``
            )
            .setColor(RED),
        ],
      });
    }

    // parsear titulo,texto — busca la primera coma, con o sin espacios
    const sep = raw.indexOf(",");
    if (sep === -1) {
      return ctx.send("falta la coma entre título y texto\nEjemplo: `.dmall Hoy jugamos,Nos vemos a las 22hs`");
    }

    const titulo = raw.slice(0, sep).trim();
    const texto  = raw.slice(sep + 1).trim();

    if (!titulo || !texto) {
      return ctx.send("el título y el texto no pueden estar vacíos");
    }

    // permisos
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

    let enviados = 0;
    let fallidos = 0;

    for (const [, miembro] of guild.members.cache) {
      if (miembro.user.bot) continue;
      try {
        await miembro.send({ embeds: [embed] });
        enviados++;
      } catch {
        fallidos++;
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

    return ctx.send(`hecho\nEnviados: **${enviados}**\nFallidos: **${fallidos}**`);
  },
};

module.exports = { data };
