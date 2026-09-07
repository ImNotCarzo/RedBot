const { EmbedBuilder, MessageFlags } = require("discord.js");
const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, prepareReply } = require("../../_shared/runtime");
const { generateGeminiText } = require("./_helpers");

const log = createCommandLogger("CMD_UTIL");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "resume",
      description: "Resume un texto largo",
      aliases: ["resumir", "summarize"],
    }),
    params: new ParamsBuilder()
      .addString({
        name: "texto",
        description: "Texto a resumir",
        required: true,
      }),

    async code(ctx) {
      const reply = await prepareReply(ctx);
      const texto = ctx.get("texto");

      if (texto.length < 100) {
        return reply({ content: "El texto es demasiado corto para resumir", flags: MessageFlags.Ephemeral });
      }

      try {
        const resumen = await generateGeminiText(
          `Resume el siguiente texto. Solo el resumen, sin frases previas ni comentarios adicionales. Objetivo, fiel al contenido original, sin opiniones ni interpretaciones. Responde en español.\n\n${texto.slice(0, 8000)}`
        );

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Resumen")
              .setDescription(resumen?.slice(0, 4000) ?? "No pude generar un resumen")
              .setColor(RED)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[util resume]", { err: err?.message ?? String(err) });
        await reply({ content: "No se pudo resumir el texto", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
