const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { RED } = require("../../../utils/colors");
const { createCommandLogger, prepareReply } = require("../../_shared/runtime");
const { PERSONA, generateGemmaVision, msATexto } = require("./_helpers");

const COLOR = RED;
const log = createCommandLogger("CMD_FUN");

module.exports = {
  command: {
    data: new CommandBuilder({
      name: "roast",
      description: "Critica despiadadamente a un usuario",
    }),
    params: new ParamsBuilder().addMember({
      name: "usuario",
      description: "Menciona a alguien",
      required: false,
    }),

    async code(ctx) {
      if (!ctx.guild) {
        return ctx.send({
          content: "Este comando solo funciona en servidores",
          flags: MessageFlags.Ephemeral,
        });
      }

      const reply = await prepareReply(ctx);

      try {
        const target = ctx.get("usuario") ?? ctx.member;
        if (!target) return reply({ content: "No pude obtener la información del usuario", flags: MessageFlags.Ephemeral });

        const user = target.user;
        const username = user.globalName ?? user.username;
        const usertag = user.username;

        const ahoraMs = Date.now();
        const createdHace = msATexto(ahoraMs - user.createdTimestamp);
        const createdDate = new Date(user.createdTimestamp).toLocaleDateString("es-ES", { year: "numeric", month: "long" });
        const joinedHace = target.joinedTimestamp ? msATexto(ahoraMs - target.joinedTimestamp) : null;
        const joinedDate = target.joinedTimestamp
          ? new Date(target.joinedTimestamp).toLocaleDateString("es-ES", { year: "numeric", month: "long" })
          : null;

        const activity = target.presence?.activities?.[0]?.name ?? null;
        const status = target.presence?.status ?? "offline";

        const roles = target.roles?.cache
          ?.filter((r) => r.id !== ctx.guild.id)
          ?.map((r) => r.name)
          ?.slice(0, 8)
          ?.join(", ") || "ninguno";

        const PERMS_RELEVANTES = [
          "Administrator", "ManageGuild", "ManageMessages",
          "ManageRoles", "BanMembers", "KickMembers", "ModerateMembers",
        ];
        const perms = target.permissions?.toArray()?.filter((p) => PERMS_RELEVANTES.includes(p))?.join(", ") || "ninguno";
        const badges = user.flags?.toArray()?.join(", ") || "ninguna";

        const datosUsuario = [
          `Nombre: ${username} (@${usertag})`,
          `Cuenta creada: hace ${createdHace} (${createdDate})`,
          joinedHace ? `Entró al servidor: hace ${joinedHace} (${joinedDate})` : "Entró al servidor: desconocido",
          `Estado: ${status}`,
          activity ? `Actividad: ${activity}` : null,
          `Roles: ${roles}`,
          `Permisos notables: ${perms}`,
          `Insignias: ${badges}`,
        ].filter(Boolean).join("\n");

        const prompt = `${PERSONA}
Tu tarea es ROASTEAR brutalmente a este usuario de Discord.
Sarcasmo, humor negro e ingenio. Sin amenazas reales. Sin ser genérico.
Usa los datos y la foto para burlarte de cosas específicas. Máximo 3 párrafos.
${datosUsuario}`;

        const avatarUrl = user.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
        const texto = (await generateGemmaVision(prompt, avatarUrl))?.slice(0, 4000)
          ?? "Ocurrió un error con la IA, intenta de nuevo";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Roast de ${username}`)
              .setThumbnail(avatarUrl)
              .setDescription(texto)
              .setColor(COLOR)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        log.error("[fun roast]", { err: err?.message ?? String(err) });
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
      }
    },
  },
};
