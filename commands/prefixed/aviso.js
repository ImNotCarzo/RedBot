const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");
const { RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "dm",
    description: "celtic dm",
    as_prefix: true,
    as_slash: false,
  }),

  params: new ParamsBuilder().addString({
    name: "mensaje",
    description: "Mensaje que recibirán los usuarios",
    required: true,
  }),

  async code(ctx) {
    const mensaje = ctx.interaction
      ? ctx.get("mensaje")
      : ctx.args?.join(" ").trim();

    if (!mensaje) {
      return ctx.send("texto???");
    }

    const member = ctx.member ?? ctx.interaction?.member;

    if (!member.permissions.has("Administrator")) {
      return ctx.send("f");
    }

    const guild = ctx.guild;

    if (!guild) {
      return ctx.send("f");
    }

    if (ctx.interaction) {
      await ctx.interaction.deferReply({ ephemeral: true });
    }

    await guild.members.fetch();

    const embed = new EmbedBuilder()
      .setTitle("HOY JUGAMOS")
      .setDescription(mensaje)
      .setColor(RED)
      .setFooter({ text: "att: carzo" })
      .setThumbnail(guild.iconURL({ size: 512 }));

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

    const resultado =
      `hecho` +
      `Enviados: **${enviados}**\n` +
      `Fallidos: **${fallidos}**`;

    if (ctx.interaction) {
      await ctx.interaction.editReply({ content: resultado });
    } else {
      await ctx.send(resultado);
    }
  },
};

module.exports = { data };
