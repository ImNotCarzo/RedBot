const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "dm",
    description: "SOLO ADMIN: enviale un mensaje a todos los usuarios",
    as_prefix: true,
    as_slash: true,
  }),

  params: new ParamsBuilder()
    .addString({
      name: "titulo",
      description: "titulo del embed",
      required: true,
    })
    .addString({
      name: "texto",
      description: "mensaje principal",
      required: true,
    }),

  async code(ctx) {
    const member = ctx.member ?? ctx.interaction?.member;
    if (!member?.permissions.has("Administrator")) return ctx.send("f");

    const guild = ctx.guild;
    if (!guild) return ctx.send(`f
                                -# no admin?`);

    let titulo, texto;

    if (ctx.interaction) {
      titulo = ctx.get("titulo");
      texto  = ctx.get("texto");
    } else {
      const raw = ctx.args?.join(" ").trim();
      if (!raw) return ctx.send("uso: `.dm titulo,texto`");
      const sep = raw.indexOf(",");
      if (sep === -1) return ctx.send("uso: `.dm titulo,texto`");
      titulo = raw.slice(0, sep).trim();
      texto  = raw.slice(sep + 1).trim();
    }

    if (!titulo || !texto) return ctx.send("uso: `.dm titulo,texto`");

    if (ctx.interaction) {
      await ctx.interaction.deferReply({ ephemeral: true });
    }

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

    const resultado = `hecho\nEnviados: **${enviados}**\nFallidos: **${fallidos}**`;

    if (ctx.interaction) {
      await ctx.interaction.editReply({ content: resultado });
    } else {
      await ctx.send(resultado);
    }
  },
};

module.exports = { data };
