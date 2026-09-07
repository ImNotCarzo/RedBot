const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, prepareReply } = require("../../_shared/runtime");
const { generateGemma } = require("./_helpers");

const log = createCommandLogger("CMD_UTIL");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "describe",
      description: "Describe el contenido de una imagen",
    }),
    params: new ParamsBuilder().addAttachment({
      name: "imagen",
      description: "Imagen a describir (jpg, png, gif, webp)",
      required: true,
    }),

    async code(ctx) {
      const reply = await prepareReply(ctx);
      const attachment = ctx.get("imagen");
      if (!attachment) {
        return reply({ content: "Debes adjuntar una imagen", flags: MessageFlags.Ephemeral });
      }

      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.some((t) => attachment.contentType?.startsWith(t))) {
        return reply({ content: "El archivo debe ser una imagen (jpg, png, gif, webp)", flags: MessageFlags.Ephemeral });
      }

      if (attachment.size > 8 * 1024 * 1024) {
        return reply({ content: "La imagen no puede superar los 8MB", flags: MessageFlags.Ephemeral });
      }

      try {
        const texto = await generateGemma([
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe detalladamente qué hay en esta imagen. Sé específico: colores, objetos, personas, texto visible, ambiente, estilo. Responde en español. Máximo 3 párrafos.",
              },
              {
                type: "image_url",
                image_url: { url: attachment.url },
              },
            ],
          },
        ]);

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Descripción de imagen")
              .setDescription(texto?.slice(0, 4000) ?? "No pude generar una descripción")
              .setThumbnail(attachment.url)
              .setColor(RED)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[util describe]", { err: err?.message ?? String(err) });
        await reply({ content: "No se pudo procesar la imagen", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
