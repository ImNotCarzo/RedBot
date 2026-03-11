const { CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const prefixCache = require("../utils/prefixCache");

const data = {
  data: new CommandBuilder({
    name: "setprefix",
    description: "Cambia o muestra el prefix del bot",
    as_prefix: true,
    as_slash: true,
  }),
  params: new ParamsBuilder().addString({
    name: "nuevo",
    description: "Nuevo prefix",
    required: false,
  }),
  async code(ctx) {
    try {
      if (!ctx.guild)
        return ctx.send("Solo se puede usar en servidores");
      if (!ctx.member.permissions.has("Administrator"))
        return ctx.send("Solo admins f");

      const nuevo = ctx.get("nuevo");

      if (!nuevo) {
        const data = await GuildConfig.findOne({ guildId: ctx.guild.id });
        const prefix = data?.prefix || "!";
        const embed = new EmbedBuilder()
          .setTitle("Prefix actual")
          .setDescription(`\`${prefix}\``)
          .setColor("Red");
        return ctx.send({ embeds: [embed] });
      }

      if (typeof nuevo !== "string")
        return ctx.send("Prefix inválido");
      if (nuevo.length > 3)
        return ctx.send("Máximo 3 caracteres");

      await GuildConfig.findOneAndUpdate(
        { guildId: ctx.guild.id },
        { prefix: nuevo },
        { upsert: true }
      );

      prefixCache.set(ctx.guild.id, nuevo);

      const embed = new EmbedBuilder()
        .setTitle("Prefix actualizado")
        .setDescription(`Nuevo prefix: \`${nuevo}\``)
        .setColor("Green");
      await ctx.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error prefix:", err);
      await ctx.send("No se pudo f");
    }
  },
};

module.exports = { data };