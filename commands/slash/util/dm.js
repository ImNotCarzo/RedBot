const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder, Plugins } = require("gralonium");
const { RED } = require("../../../utils/colors");
const { sendLog } = require("../../../src/guild");
const { noGuildReply, createCommandLogger } = require("../../_shared/runtime");
const { sendWithRetry, sleep } = require("./_helpers");

const log = createCommandLogger("CMD_UTIL");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "dm",
      description: "Envía un DM con embed a todos los miembros del servidor",
      as_prefix: false,
      as_slash: true,
    }),

    params: new ParamsBuilder()
      .addString({
        name: "titulo",
        description: "Título del embed",
        required: true,
      })
      .addString({
        name: "texto",
        description: "Mensaje que recibirán los usuarios",
        required: true,
      })
      .addRole({
        name: "solo_rol",
        description: "Enviar solo a miembros con este rol",
        required: false,
      })
      .addRole({
        name: "excluir_rol",
        description: "Excluir todos los miembros con este rol",
        required: false,
      })
      .addMember({
        name: "excluir_usuario",
        description: "Excluir un usuario específico",
        required: false,
      })
      .addAttachment({
        name: "imagen",
        description: "Imagen opcional para adjuntar al embed",
        required: false,
      }),

    plugins: [Plugins.hasPerms("Administrator")],

    async code(ctx) {
      if (!ctx.guild) return noGuildReply(ctx);

      const titulo          = ctx.get("titulo");
      const texto           = ctx.get("texto");
      const soloRol         = ctx.get("solo_rol");
      const rolExcluido     = ctx.get("excluir_rol");
      const usuarioExcluido = ctx.get("excluir_usuario");
      const imagen          = ctx.get("imagen");

      await ctx.interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const author    = ctx.author;
      const avatarUrl = author.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });

      const embed = new EmbedBuilder()
        .setTitle(titulo)
        .setDescription(texto)
        .setColor(RED)
        .setFooter({ text: `att: ${author.globalName ?? author.username}`, iconURL: avatarUrl })
        .setThumbnail(ctx.guild.iconURL({ size: 512 }));

      if (imagen) embed.setImage(imagen.url);

      await ctx.guild.members.fetch();

      const members = [...ctx.guild.members.cache.values()].filter((m) => {
        if (m.user.bot) return false;
        if (soloRol         && !m.roles.cache.has(soloRol.id))         return false;
        if (rolExcluido     &&  m.roles.cache.has(rolExcluido.id))     return false;
        if (usuarioExcluido &&  m.id === usuarioExcluido.id)           return false;
        return true;
      });

      const total = members.length;
      await ctx.interaction.editReply({ content: `enviando... 0/${total}` });

      let enviados = 0;
      let fallidos = 0;

      for (let i = 0; i < members.length; i++) {
        const ok = await sendWithRetry(members[i], { embeds: [embed] });
        if (ok) enviados++; else fallidos++;

        await sleep(500);

        if (i % 10 === 0) {
          await ctx.interaction.editReply({ content: `enviando... ${i + 1}/${total}` }).catch(() => null);
        }
      }

      const filtros = [
        soloRol         ? `Solo rol: ${soloRol} (\`${soloRol.id}\`)`                              : null,
        rolExcluido     ? `Rol excluido: ${rolExcluido} (\`${rolExcluido.id}\`)`                  : null,
        usuarioExcluido ? `Usuario excluido: ${usuarioExcluido.user.tag} (\`${usuarioExcluido.id}\`)` : null,
      ].filter(Boolean);

      const logEmbed = new EmbedBuilder()
        .setTitle("DM masivo enviado")
        .setColor(RED)
        .addFields(
          { name: "Moderador", value: author.tag ?? author.username, inline: true  },
          { name: "Enviados",  value: `\`${enviados}\``,             inline: true  },
          { name: "Fallidos",  value: `\`${fallidos}\``,             inline: true  },
          { name: "Título",    value: titulo,                         inline: false },
          { name: "Texto",     value: texto,                          inline: false },
          ...(filtros.length ? [{ name: "Filtros", value: filtros.join("\n"), inline: false }] : []),
        )
        .setTimestamp();

      await sendLog(ctx.guild, logEmbed);

      await ctx.interaction.editReply({
        content: `hecho\nEnviados: **${enviados}**\nFallidos: **${fallidos}**`,
      });
    },
  },
};
