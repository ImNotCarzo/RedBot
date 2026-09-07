const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, MessageFlags } = require("discord.js");
const { createCommandLogger } = require("../../_shared/runtime");
const { resolveUser, resolveMember, uniqueId } = require("./_helpers");

const log = createCommandLogger("CMD_USER_BANNER");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "banner", description: "Muestra el banner de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        let user, member;

        if (ctx.guild) {
          member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");
          user = await member.user.fetch().catch(() => member.user);
        } else {
          user = await resolveUser(ctx, input);
          if (!user) return ctx.send("No pude encontrar al usuario");
          user = await user.fetch().catch(() => user);
          member = null;
        }

        const serverBannerURL = member?.bannerURL?.({ size: 4096 }) ?? null;
        const globalBannerURL = user.bannerURL({ size: 4096 });
        if (!globalBannerURL && !serverBannerURL) return ctx.send("Este usuario no tiene banner");

        const hasDistinct = !!(serverBannerURL && serverBannerURL !== globalBannerURL);
        const color = member?.displayHexColor || "#ff383d";

        const buildEmbed = (type) => {
          const isServer = type === "server";
          const url = isServer ? serverBannerURL : globalBannerURL;
          return new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
            .setTitle(hasDistinct ? (isServer ? "Banner del servidor" : "Banner global") : "Banner")
            .setURL(url)
            .setImage(url)
            .setColor(color)
            .setTimestamp();
        };

        const selectId = uniqueId("banner_select");
        const selectRow = hasDistinct
          ? [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(selectId)
                  .setPlaceholder("Tipo de banner...")
                  .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel("Banner del Servidor").setDescription("Banner de servidor").setValue("server"),
                    new StringSelectMenuOptionBuilder().setLabel("Banner Global").setDescription("Banner global").setValue("global")
                  )
              ),
            ]
          : [];

        const reply = await ctx.send({ embeds: [buildEmbed(serverBannerURL ? "server" : "global")], components: selectRow });
        if (!hasDistinct) return;

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

        collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
      } catch (err) {
        log.error("Error en user banner", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener el banner");
      }
    },
  },
};
