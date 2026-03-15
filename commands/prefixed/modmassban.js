const { CommandBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const sendLog = require("../../utils/sendLog");
const { RED } = require("../../utils/colors");
const { resolveMember } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "massban",
    description: "Banea a múltiples usuarios a la vez (hasta 5 menciones o IDs)",
    aliases: ["modmassban", "mban"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      if (!ctx.member.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tienes el permiso `BanMembers`");

      if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
        return ctx.send("No tengo permiso para banear");

      const modTag = ctx.author?.tag ?? ctx.author?.username;

      // Recoger todos los miembros mencionados o IDs en los args (hasta 5)
      const mentionedMembers = [...(ctx.message?.mentions?.members?.values() ?? [])].slice(0, 5);

      // Si no hay menciones, intentar resolver por IDs en args
      const targets = mentionedMembers.length
        ? mentionedMembers
        : (await Promise.all(
            (ctx.args ?? []).slice(0, 5).map(a => resolveMember(ctx, a))
          )).filter(Boolean);

      // Extract reason: strip all mentions and IDs from args, then the first arg (command invocation has no raw prefix here)
      const reasonArgs = (ctx.args ?? []).filter(a => !/<@[!&]?\d+>/.test(a) && !/^\d{17,20}$/.test(a));
      const reason = reasonArgs.join(" ").trim() || "Sin razón";

      if (!targets.length) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Massban", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `**Usos:**\nBanea a múltiples usuarios a la vez (hasta 5)` +
            `\n\n**Aliases:**\n\`modmassban\`, \`mban\`` +
            `\n\n\`\`\`js\n.massban <@usuario1> <@usuario2> ... /razonOpcional/\nEjemplo: .massban @loge @otro chau\`\`\``
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      }

      const banned = [];
      const failed = [];

      for (const member of targets) {
        if (
          member.id === guild.ownerId ||
          member.roles.highest.position >= guild.members.me.roles.highest.position ||
          member.roles.highest.position >= ctx.member.roles.highest.position
        ) {
          failed.push(member);
          continue;
        }
        try {
          await member.user.send({
            embeds: [new EmbedBuilder().setColor(RED).setDescription(`Fuiste baneado de **${guild.name}**`).setTimestamp()],
          }).catch(() => {});
          await member.ban({ reason: `${modTag}: massban: ${reason}` });
          banned.push(member);
        } catch {
          failed.push(member);
        }
      }

      const publicEmbed = new EmbedBuilder()
        .setTitle("Massban ejecutado")
        .setColor(RED)
        .addFields(
          { name: "Baneados", value: banned.length ? banned.map(m => m.user.tag).join(", ") : "Ninguno", inline: false },
          ...(failed.length ? [{ name: "Fallidos", value: failed.map(m => m.user.tag).join(", "), inline: false }] : []),
        )
        .setTimestamp();

      await ctx.send({ embeds: [publicEmbed] });

      if (banned.length) {
        const logEmbed = new EmbedBuilder()
          .setTitle("Massban ejecutado")
          .setColor(RED)
          .addFields(
            { name: "Moderador", value: modTag,                                      inline: true },
            { name: "Baneados",  value: `${banned.length}`,                          inline: true },
            { name: "Fallidos",  value: `${failed.length}`,                          inline: true },
            { name: "Razón",     value: reason,                                      inline: false },
            { name: "Usuarios",  value: banned.map(m => `${m.user.tag} (\`${m.id}\`)`).join("\n"), inline: false },
          )
          .setTimestamp();

        await sendLog(guild, logEmbed);
      }
    } catch {
      await ctx.send("No se pudo ejecutar el massban");
    }
  },
};

module.exports = { data };
