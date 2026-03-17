const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { GREEN, RED } = require("../../utils/colors");

const data = {
  data: new CommandBuilder({
    name: "rename",
    description: "Renombra un canal",
    aliases: ["chrename", "channelrename"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const channel = ctx.message?.mentions?.channels?.first() ?? ctx.channel;
      const args    = ctx.args ?? [];
      // Remove channel mention token (<#id>) from args to get just the name
      const newName = args
        .filter((a) => !/^<#\d+>$/.test(a))
        .join(" ")
        .toLowerCase()
        .replace(/\s+/g, "-")
        .slice(0, 100);

      if (!newName) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Rename", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nRenombra un canal` +
            `\n\n**Aliases:**\n\`chrename\`, \`channelrename\`` +
            `\n\n\`\`\`js\n.rename [#canal] <nuevo>\nEjemplo: .rename #uxiono padalustro\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      }

      if (!ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tienes el permiso `ManageChannels`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return ctx.send("No tengo permiso para editar canales");

      const modTag  = ctx.author?.tag ?? ctx.author?.username;
      const oldName = channel.name;

      await channel.setName(newName, `${modTag}: channel rename`);

      const publicEmbed = new EmbedBuilder()
        .setTitle("Canal renombrado")
        .setColor(GREEN)
        .addFields(
          { name: "Antes", value: `\`${oldName}\``, inline: true },
          { name: "Ahora", value: `\`${newName}\``, inline: true },
        )
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("Canal renombrado")
        .setColor(GREEN)
        .addFields(
          { name: "Canal",     value: `${channel} (\`${channel.id}\`)`, inline: true },
          { name: "Moderador", value: modTag,                            inline: true },
          { name: "Antes",     value: `\`${oldName}\``,                 inline: true },
          { name: "Ahora",     value: `\`${newName}\``,                 inline: true },
        )
        .setTimestamp();

      await sendLog(guild, logEmbed);
    } catch {
      await ctx.send("No se pudo renombrar el canal");
    }
  },
};

module.exports = { data };
