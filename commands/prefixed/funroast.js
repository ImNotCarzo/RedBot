const { CommandBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { GoogleGenAI } = require("@google/genai");

const COLOR = "#ff383d";

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

// AI

function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI });
}

async function generateGemmaVision(prompt, imageUrl) {
  const imgRes    = await fetch(imageUrl);
  const imgBuf    = await imgRes.arrayBuffer();
  const imgBase64 = Buffer.from(imgBuf).toString("base64");
  const mimeType  = imgRes.headers.get("content-type") ?? "image/png";

  const response = await getAI().models.generateContent({
    model: "gemma-3-12b-it",
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imgBase64 } },
      ],
    }],
    config: { temperature: 1.2 },
  });

  return response.text?.trim() ?? null;
}

// HELPERS

function msATexto(ms) {
  const min  = Math.floor(ms / 60000);
  const hrs  = Math.floor(min / 60);
  const dias = Math.floor(hrs / 24);
  const mes  = Math.floor(dias / 30);
  const años = Math.floor(dias / 365);

  if (años >= 1) return `${años} año${años > 1 ? "s" : ""}`;
  if (mes  >= 1) return `${mes} mes${mes > 1 ? "es" : ""}`;
  if (dias >= 1) return `${dias} día${dias > 1 ? "s" : ""}`;
  if (hrs  >= 1) return `${hrs} hora${hrs > 1 ? "s" : ""}`;
  return `${min} minuto${min > 1 ? "s" : ""}`;
}

// COMMAND

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

    const typing = setInterval(() => {
      ctx.channel?.sendTyping?.().catch(() => {});
    }, 8000);

    try {
      const target = ctx.message?.mentions?.members?.first() ?? ctx.member;
      if (!target) return ctx.send("No pude obtener la información del usuario");

      const user     = target.user;
      const username = user.globalName ?? user.username;
      const usertag  = user.username;

      const ahoraMs     = Date.now();
      const createdHace = msATexto(ahoraMs - user.createdTimestamp);
      const createdDate = new Date(user.createdTimestamp).toLocaleDateString("es-ES", { year: "numeric", month: "long" });

      const joinedHace = target.joinedTimestamp
        ? msATexto(ahoraMs - target.joinedTimestamp)
        : null;

      const joinedDate = target.joinedTimestamp
        ? new Date(target.joinedTimestamp).toLocaleDateString("es-ES", { year: "numeric", month: "long" })
        : null;

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

      const perms  = target.permissions?.toArray()?.filter(p => PERMS_RELEVANTES.includes(p))?.join(", ") || "ninguno";
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

      const avatarUrl = user.displayAvatarURL({
        size: 256,
        extension: "png",
        forceStatic: true,
      });

      const texto = (await generateGemmaVision(prompt, avatarUrl))?.slice(0, 4000)
        ?? "Ocurrió un error con la IA, intenta de nuevo";

      await ctx.send({
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
      console.error("[fun roast prefix]", err);
      await ctx.send("Ocurrió un error con la IA, intenta de nuevo");
    } finally {
      clearInterval(typing);
    }
  },
};

module.exports = { data };
