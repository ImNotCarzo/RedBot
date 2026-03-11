const { CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder, version: djsVersion } = require("discord.js");
const { version: botVersion } = require("./package.json");
const { version: erineVersion } = require("./node_modules/erine/package.json");

const formatUptime = (ms) => {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return `${d}d/${h}h/${m}m/${s}s`;
};

const data = {
  data: new CommandBuilder({
    name: "botinfo",
    description: "Información general del bot",
    aliases: ["bot", "info"],
    as_prefix: true,
    as_slash: false,
  }),
  params: new ParamsBuilder(),

  async code(ctx) {
    try {
      const bot = ctx.bot;
      if (!bot?.user) return ctx.send("Error al obtener la información");

      const servers   = bot.guilds.cache.size;
      const users     = bot.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
      const createdAt = Math.floor(bot.user.createdTimestamp / 1000);

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: bot.user.username, iconURL: bot.user.displayAvatarURL() })
            .setFields(
              {
                name: "Básico",
                value: `> **ID:** \`${bot.user.id}\`\n> **Creación:** <t:${createdAt}:d>\n> **Versión:** \`${botVersion}\``,
              },
              {
                name: "Estadísticas",
                value: `> **Servidores:** \`${servers}\`\n> **Usuarios:** \`${users}\`\n> **Tiempo activo:** \`${formatUptime(bot.uptime)}\``,
              },
              {
                name: "Extra",
                value: `> **Creador:** \`carzo.\`\n> **Node.js:** \`${process.version}\`\n> **discord.js:** \`v${djsVersion}\`\n> **Erine:** \`v${erineVersion}\``,
              },
            )
            .setColor("#ff383d")
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[botinfo]", err);
      await ctx.send("Algo salió mal");
    }
  },
};

module.exports = { data };
