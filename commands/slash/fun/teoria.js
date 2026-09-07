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
      name: "teoria",
      description: "Una teoría conspirativa sobre cualquier cosa",
    }),
    params: new ParamsBuilder().addString({
      name: "tema",
      description: "¿Sobre qué quieres la teoría?",
      required: true,
    }),

    async code(ctx) {
      const reply = await prepareReply(ctx);
      const tema = ctx.get("tema");

      try {
        const texto =
          (await generateGeminiFlash(
            `${PERSONA}\nCrea una teoría conspirativa ridícula pero internamente consistente sobre: "${tema}". Preséntala como si fuera verdad, con "evidencia" inventada y conexiones absurdas. Máximo 3 párrafos, sin aclarar que es ficción.`
          ))?.slice(0, 4000) ?? "No pude generar una teoría";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Teoría: ${tema}`)
              .setDescription(texto)
              .setColor(COLOR)
              .setFooter({ text: "Esto es ficción... o quizás no." })
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[fun teoria]", { err: err?.message ?? String(err) });
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
