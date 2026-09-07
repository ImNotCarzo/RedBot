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
      name: "critica",
      description: "Te doy una crítica despiadada de algo",
    }),
    params: new ParamsBuilder().addString({
      name: "tema",
      description: "¿Qué quieres que critique?",
      required: true,
    }),

    async code(ctx) {
      const reply = await prepareReply(ctx);
      const tema = ctx.get("tema");

      try {
        const texto =
          (await generateGeminiFlash(
            `${PERSONA}\nHaz una crítica directa, ingeniosa y sin piedad de: "${tema}". Señala sus puntos débiles con humor y sarcasmo. Máximo 3 párrafos, sin introducción genérica.`
          ))?.slice(0, 4000) ?? "No pude generar una crítica";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Crítica de: ${tema}`)
              .setDescription(texto)
              .setColor(COLOR)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[fun critica]", { err: err?.message ?? String(err) });
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
