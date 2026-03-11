const { CommandBuilder } = require("erine");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const OWNER_ID = "668550027307909162";

const data = {
  data: new CommandBuilder({
    name: "setavatar",
    description: "Cambia el avatar del bot",
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    try {
      const userId = ctx.user?.id ?? ctx.author?.id;
      if (userId !== OWNER_ID) return ctx.send("No tenés permiso para usar esto");

      const url = ctx.args?.[0] || ctx.message?.attachments?.first()?.url;
      if (!url) return ctx.send("Mandá una URL o adjuntá una imagen");

      const res = await fetch(url);
      if (!res.ok) return ctx.send(`No pude descargar la imagen: ${res.status}`);

      const buffer = await res.buffer();
      await ctx.bot.user.setAvatar(buffer);
      await ctx.send("Avatar actualizado");

    } catch (err) {
      console.error("Error en setavatar:", err);
      await ctx.send("No se pudo cambiar el avatar");
    }
  },
};

module.exports = { data };