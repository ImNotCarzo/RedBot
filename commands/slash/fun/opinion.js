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
      name: "opinion",
      description: "Pide mi opinión sin filtro sobre algo",
    }),
    params: new ParamsBuilder().addString({
      name: "tema",
      description: "¿Sobre qué quieres mi opinión?",
      required: true,
    }),

    async code(ctx) {
      const reply = await prepareReply(ctx);
      const tema = ctx.get("tema");

      try {
        const texto =
          (await generateGeminiFlash(
            `${PERSONA}\nDa tu opinión personal, sarcástica y sin filtro sobre: "${tema}". Máximo 3 párrafos, sin introducción genérica, ve directo al punto.`
          ))?.slice(0, 4000) ?? "No pude generar una opinión";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Mi opinión sobre: ${tema}`)
              .setDescription(texto)
              .setColor(COLOR)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[fun opinion]", { err: err?.message ?? String(err) });
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
