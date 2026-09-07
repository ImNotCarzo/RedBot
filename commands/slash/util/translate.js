const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, prepareReply } = require("../../_shared/runtime");

const log = createCommandLogger("CMD_UTIL");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "translate",
      description: "Traduce texto a otro idioma",
      aliases: ["traducir", "trans"],
    }),
    params: new ParamsBuilder()
      .addString({
        name: "texto",
        description: "Texto a traducir",
        required: true,
      })
      .addString({
        name: "idioma",
        description: "Idioma destino (ej: es, en, fr, de) por defecto español",
        required: false,
      }),

    async code(ctx) {
      const reply = await prepareReply(ctx);
      const texto = ctx.get("texto");
      const idioma = ctx.get("idioma") ?? "es";

      try {
        const { translate } = require("@vitalets/google-translate-api");
        const result = await translate(texto, { to: idioma });

        const origen = result.raw?.src ?? "auto";
        const traduccion = result.text;

        if (!traduccion)
          return reply({ content: "No se pudo generar la traducción", flags: MessageFlags.Ephemeral });

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Traducción")
              .setColor(RED)
              .addFields(
                { name: "Original", value: texto.slice(0, 1024), inline: false },
                { name: "Traducción", value: traduccion.slice(0, 1024), inline: false }
              )
              .setFooter({ text: `${origen} → ${idioma}` })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[util translate]", { err: err?.message ?? String(err) });
        if (err.name === "TooManyRequestsError")
          return reply({ content: "Google Translate está saturado, intenta en unos segundos", flags: MessageFlags.Ephemeral });
        await reply({ content: "No se pudo conectar con el servicio de traducción", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
