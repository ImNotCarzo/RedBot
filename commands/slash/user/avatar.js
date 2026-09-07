const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, MessageFlags } = require("discord.js");
const { createCommandLogger } = require("../../_shared/runtime");
const { resolveUser, resolveMember, uniqueId } = require("./_helpers");

const log = createCommandLogger("CMD_USER_AVATAR");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "avatar", description: "Muestra el avatar de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const guild = ctx.guild;
        let user, member;

        if (guild) {
          member = await resolveMember(ctx, input);
          if (!member) return ctx.send("No pude encontrar al usuario");
          user = member.user;
        } else {
          user = await resolveUser(ctx, input);
          if (!user) return ctx.send("No pude encontrar al usuario");
          member = null;
        }

        const avatarOpts = { extension: "png", size: 4096 };
        const serverAvatar = member ? member.displayAvatarURL(avatarOpts) : user.displayAvatarURL(avatarOpts);
        const globalAvatar = user.displayAvatarURL(avatarOpts);
        const hasDistinct = !!(member?.avatar && member.avatar !== user.avatar);
        const color = member?.displayHexColor || "#ff383d";

        const buildEmbed = (type) =>
          new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
            .setTitle(hasDistinct ? (type === "server" ? "Avatar del servidor" : "Avatar global") : "Avatar")
            .setURL(type === "server" ? serverAvatar : globalAvatar)
            .setImage(type === "server" ? serverAvatar : globalAvatar)
            .setColor(color)
            .setTimestamp();

        const selectId = uniqueId("avatar_select");
        const selectRow = hasDistinct
          ? [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(selectId)
                  .setPlaceholder("Tipo de avatar...")
                  .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setDescription("Avatar de servidor").setValue("server"),
                    new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setDescription("Avatar global").setValue("global")
                  )
              ),
            ]
          : [];

        const reply = await ctx.send({ embeds: [buildEmbed("server")], components: selectRow });
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
        log.error("Error en user avatar", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener el avatar");
      }
    },
  },
};
