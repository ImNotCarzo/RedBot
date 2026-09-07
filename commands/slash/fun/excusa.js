const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, prepareReply } = require("../../_shared/runtime");
const { PERSONA, generateGeminiFlash } = require("./_helpers");

const COLOR = RED;
const log = createCommandLogger("CMD_FUN");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "excusa",
      description: "Genera una excusa ridícula pero creativa",
    }),
    params: new ParamsBuilder().addString({
      name: "situacion",
      description: "¿Para qué necesitas la excusa?",
      required: false,
    }),

    async code(ctx) {
      const reply = await prepareReply(ctx);
      const situacion = ctx.get("situacion")?.trim() || "cualquier situación";

      try {
        const prompt =
          situacion === "cualquier situación"
            ? `${PERSONA}\nGenera una excusa ridícula, creativa y divertida para cualquier situación. Que sea graciosa, original y tenga narrativa. Máximo 2 párrafos.`
            : `${PERSONA}\nGenera una excusa ridícula, creativa y medianamente plausible para: "${situacion}". Que sea graciosa, original y tenga narrativa. Máximo 2 párrafos.`;

        const texto =
          (await generateGeminiFlash(prompt))?.slice(0, 4000) ||
          "No pude generar una excusa";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Tu excusa profesional")
              .setDescription(texto)
              .setColor(COLOR)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[fun excusa]", { err: err?.message ?? String(err) });
        await reply({
          content: "Ocurrió un error con la IA, intenta de nuevo",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  },
};
