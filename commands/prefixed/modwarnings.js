const { CommandBuilder } = require("erine");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const Warn = require("../../models/Warn");
const { YELLOW } = require("../../utils/colors");
const { resolveMember } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "warnings",
    description: "Muestra las advertencias de un usuario",
    aliases: ["warns", "modwarnings"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const guild = ctx.guild;
      if (!guild) return ctx.send("Solo se puede usar en servidores");

      const input = ctx.args?.[0] || null;
      const member = await resolveMember(ctx, input);
      if (!member) {
        const bot = ctx.bot.user;
        const paramerror = new EmbedBuilder()
          .setAuthor({ name: "Comando Warnings", iconURL: bot.displayAvatarURL() })
          .setDescription(
            `\`\`\`js\n.warnings <@usuario>\nEjemplo: .warnings @loge\`\`\`` +
            `\n\n**Usos:**\nMuestra las advertencias de un usuario` +
            `\n\n**Aliases:**\nwarns, modwarnings`
          )
          .setColor(RED);

        return ctx.send({ embeds: [paramerror] });
      }
      if (!ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return ctx.send("No tienes el permiso `ModerateMembers`");

      const warns = await Warn.find({ guildId: guild.id, userId: member.id }).sort({ createdAt: -1 });

      if (!warns.length) return ctx.send(`${member.user.tag} no tiene advertencias`);

      const perPage = 5;
      const pages = [];
      for (let i = 0; i < warns.length; i += perPage) pages.push(warns.slice(i, i + perPage));

      let page = 0;
      const authorId = ctx.author.id;
      const prevId = `warns_prev_${Date.now()}`;
      const nextId = `warns_next_${Date.now()}`;

      const buildEmbed = () => {
        const embed = new EmbedBuilder()
          .setTitle(`Advertencias de ${member.user.tag} (${page + 1}/${pages.length})`)
          .setColor(YELLOW)
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .setFooter({ text: `${warns.length} advertencias en total` });

        for (const w of pages[page]) {
          embed.addFields({
            name: `\`${w.warnId}\` — <t:${Math.floor(w.createdAt.getTime() / 1000)}:d>`,
            value: `> **Razón:** ${w.reason}\n> **Mod:** <@${w.moderator}>`,
          });
        }

        return embed;
      };

      const buildRow = (p) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(prevId).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
          new ButtonBuilder().setCustomId(nextId).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(p === pages.length - 1)
        );

      const msg = await ctx.send({
        embeds: [buildEmbed()],
        components: pages.length > 1 ? [buildRow(page)] : [],
      });

      if (pages.length <= 1) return;

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 2 * 60 * 1000,
        filter: i => [prevId, nextId].includes(i.customId),
      });

      collector.on("collect", async i => {
        if (i.user.id !== authorId)
          return i.reply({ content: "No puedes interactuar con esto", flags: MessageFlags.Ephemeral });
        if (i.customId === prevId) page--;
        if (i.customId === nextId) page++;
        await i.update({ embeds: [buildEmbed()], components: [buildRow(page)] });
      });

      collector.on("end", async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });
    } catch {
      await ctx.send("No se pudieron obtener las advertencias");
    }
  },
};

module.exports = { data };
