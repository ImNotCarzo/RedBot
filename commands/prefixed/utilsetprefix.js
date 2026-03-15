const { CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const GuildConfig = require("../../models/GuildConfig");
const prefixCache = require("../../utils/prefixCache");

const data = {
  data: new CommandBuilder({
    name: "setprefix",
    description: "Cambia o muestra el prefix del bot en este servidor",
    aliases: ["prefix"],
    as_prefix: true,
    as_slash: false,
  }),
  params: new ParamsBuilder()
    .addString({
      name: "nuevo",
      description: "Nuevo prefix (omitir para ver el actual)",
      required: false,
    }),

  async code(ctx) {
    try {
      if (!ctx.guild)
        return ctx.send("Este comando solo funciona en servidores");

      if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
        return ctx.send("Necesitas el permiso `Administrator`");

      const nuevo = ctx.get("nuevo");

      if (!nuevo) {
        const config = await GuildConfig.findOne({ guildId: ctx.guild.id });
        const prefix = config?.prefix ?? ".";
        return ctx.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Prefix actual")
              .setDescription(`\`${prefix}\``)
              .setColor("#ff383d"),
          ],
        });
      }

      if (nuevo.length > 3)
        return ctx.send("El prefix no puede tener más de 3 caracteres");

      await GuildConfig.findOneAndUpdate(
        { guildId: ctx.guild.id },
        { prefix: nuevo },
        { upsert: true }
      );

      prefixCache.set(ctx.guild.id, nuevo);

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Prefix actualizado")
            .setDescription(`Nuevo prefix: \`${nuevo}\``)
            .setColor("#23a55a"),
        ],
      });
    } catch (err) {
      console.error("[setprefix]", err);
      await ctx.send("No se pudo cambiar el prefix");
    }
  },
};

module.exports = { data };
