const { CommandBuilder, ParamsBuilder } = require("gralonium");
const intervals = new Map(); // guildId → intervalId

async function rotarIcono(guild) {
  const emojis = [...guild.emojis.cache.filter((e) => !e.animated).values()];
  if (!emojis.length) return;

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  const url   = emoji.imageURL({ size: 256, extension: "png" });

  await guild.setBanner(url).catch(() => null);
}

const data = {
  data: new CommandBuilder({
    name: "comandointervalosupersecretokjj",
    description: "rota foto con emoji 15min",
    as_prefix: true,
    as_slash: false,
  }),

  params: new ParamsBuilder(),

  async code(ctx) {
    const member = ctx.member;
    if (!member?.permissions.has("Administrator")) return ctx.send("f");

    const guild = ctx.guild;
    if (!guild) return ctx.send("f");

    const emojis = guild.emojis.cache.filter((e) => !e.animated);
    if (!emojis.size) return ctx.send("no emoji?");

    if (intervals.has(guild.id)) {
      clearInterval(intervals.get(guild.id));
      intervals.delete(guild.id);
      return ctx.send("fin");
    }

    // primer cambio inmediato
    await rotarIcono(guild);

    const id = setInterval(() => rotarIcono(guild), 15 * 60 * 1000);
    intervals.set(guild.id, id);

    return ctx.send(
      `go\n` +
      `disponibles: **${emojis.size}**\n`
    );
  },
};

module.exports = { data };
