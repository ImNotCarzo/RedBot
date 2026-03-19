const { CommandBuilder } = require("erine");
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const { resolveMemberFlexible } = require("../../utils/helpers");

const data = {
  data: new CommandBuilder({
    name: "banner",
    description: "Muestra el banner de un usuario",
    aliases: ["userbanner"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const input = ctx.args?.join(" ").trim() || null;
      const invoker = ctx.author;
      const member = await resolveMemberFlexible(ctx, input);
      if (!member) return ctx.send("No pude encontrar al usuario");

      const user = await member.user.fetch().catch(() => member.user);
      const serverBannerURL = member.bannerURL?.({ size: 4096 }) ?? null;
      const globalBannerURL = user.bannerURL({ size: 4096 });

      if (!globalBannerURL && !serverBannerURL) return ctx.send("Este usuario no tiene banner");

      const hasDistinctBanner = serverBannerURL && serverBannerURL !== globalBannerURL;
      const colorRol = member.displayHexColor || "#2b2d31";

      const buildEmbed = (type) => {
        const isServer = type === "server";
        const url = isServer ? serverBannerURL : globalBannerURL;
        return new EmbedBuilder()
          .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
          .setTitle(hasDistinctBanner ? (isServer ? "Banner del servidor" : "Banner global") : "Banner")
          .setURL(url)
          .setImage(url)
          .setColor(colorRol)
          .setTimestamp();
      };

      const selectId = `banner_select_${Date.now()}`;
      const selectRow = hasDistinctBanner
        ? [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(selectId)
              .setPlaceholder("Tipo de banner...")
              .addOptions(
                new StringSelectMenuOptionBuilder().setLabel("Banner del Servidor").setDescription("Banner de servidor").setValue("server"),
                new StringSelectMenuOptionBuilder().setLabel("Banner Global").setDescription("Banner global").setValue("global")
              )
          )]
        : [];

      const reply = await ctx.send({ embeds: [buildEmbed(serverBannerURL ? "server" : "global")], components: selectRow });
      if (!hasDistinctBanner) return;

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
        filter: (i) => i.customId === selectId,
      });

      collector.on("collect", async (interaction) => {
        if (interaction.user.id !== invoker.id) {
          return interaction.reply({ embeds: [buildEmbed(interaction.values[0])], flags: MessageFlags.Ephemeral });
        }
        await interaction.update({ embeds: [buildEmbed(interaction.values[0])] });
      });

      collector.on("end", async () => {
        await reply.edit({ components: [] }).catch(() => {});
      });

    } catch (err) {
      console.error("Error en banner:", err);
      await ctx.send("No se pudo obtener el banner");
    }
  },
};

module.exports = { data };