const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { generateWithFallback } = require("../../utils/ai");

const COLOR = "#ff383d";

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.`;

const data = {
  data: new CommandBuilder({
    name: "roast",
    description: "Critica despiadadamente a un usuario",
    aliases: ["quemar", "burn"],
    as_prefix: true,
    as_slash: false,
  }),

  async code(ctx) {
    if (!ctx.guild) {
      return ctx.send("Este comando solo funciona en servidores");
    }

    try {
      const target = ctx.message?.mentions?.members?.first() ?? ctx.member;

      if (!target) {
        return ctx.send("No pude obtener la información del usuario");
      }

      const user     = target.user;
      const username = user.globalName ?? user.username;
      const usertag  = user.username;
      const created  = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
      const joined   = target.joinedTimestamp
        ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`
        : "desconocido";

      const activity = target.presence?.activities?.[0]?.name ?? null;
      const status   = target.presence?.status ?? "offline";

      const roles = target.roles?.cache
        ?.filter(r => r.id !== ctx.guild.id)
        ?.map(r => r.name)
        ?.slice(0, 8)
        ?.join(", ") || "ninguno";

      const PERMS_RELEVANTES = [
        "Administrator", "ManageGuild", "ManageMessages",
        "ManageRoles", "BanMembers", "KickMembers", "ModerateMembers",
      ];
      const perms = target.permissions?.toArray()
        ?.filter(p => PERMS_RELEVANTES.includes(p))
        ?.join(", ") || "ninguno";

      const badges = user.flags?.toArray()?.join(", ") || "ninguna";

      const datosUsuario = [
        `Nombre: ${username} (@${usertag})`,
        `Cuenta creada: ${created}`,
        `Entró al servidor: ${joined}`,
        `Estado: ${status}`,
        activity ? `Actividad: ${activity}` : null,
        `Roles: ${roles}`,
        `Permisos notables: ${perms}`,
        `Insignias: ${badges}`,
      ].filter(Boolean).join("\n");

      const prompt = `${PERSONA}

Tu tarea es ROASTEAR brutalmente a este usuario de Discord.
Sarcasmo, humor negro e ingenio. Sin amenazas reales. Sin ser genérico.
Usa los datos para burlarte de cosas específicas. Máximo 3 párrafos.

${datosUsuario}`;

      const response = await generateWithFallback({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{
          role: "user",
          parts: [{ text: prompt }],
        }],
      });

      const texto = response.text?.trim().slice(0, 4000) ?? "Ocurrió un error con la IA, intenta de nuevo";

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Roast de ${username}`)
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .setDescription(texto)
            .setColor(COLOR)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[funroast]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    }
  },
};

module.exports = { data };
