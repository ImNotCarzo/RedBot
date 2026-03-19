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
    name: "avatar",
    description: "Muestra el avatar de un usuario",
    aliases: ["av", "useravatar"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const input = ctx.args?.join(" ").trim() || null;
      const invoker = ctx.author;
      const member = await resolveMemberFlexible(ctx, input);
      if (!member) return ctx.send("No pude encontrar al usuario");

      const user = member.user;
      const avatarOpts = { extension: "png", size: 4096 };
      const serverAvatar = member.displayAvatarURL(avatarOpts);
      const globalAvatar = user.displayAvatarURL(avatarOpts);
      const hasDistinctAvatar = member.avatar && member.avatar !== user.avatar;

      const buildEmbed = (type) => {
        const isServer = type === "server";
        return new EmbedBuilder()
          .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
          .setTitle(isServer ? "Avatar del servidor" : "Avatar global")
          .setURL(isServer ? serverAvatar : globalAvatar)
          .setImage(isServer ? serverAvatar : globalAvatar)
          .setColor(member.displayHexColor || "#2b2d31")
          .setTimestamp();
      };

      const selectId = `avatar_select_${Date.now()}`;
      const selectRow = hasDistinctAvatar
        ? [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(selectId)
              .setPlaceholder("Tipo de avatar...")
              .addOptions(
                new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setDescription("Avatar de servidor").setValue("server"),
                new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setDescription("Avatar global").setValue("global")
              )
          )]
        : [];

      const reply = await ctx.send({ embeds: [buildEmbed("server")], components: selectRow });
      if (!hasDistinctAvatar) return;

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
      console.error("Error en avatar:", err);
      await ctx.send("No se pudo obtener el avatar");
    }
  },
};

module.exports = { data };