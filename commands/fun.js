const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { getAI } = require("../utils/ai");

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

const COLOR = "#ff383d";

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

// ─────────────────────────────────────────────
//  AI
// ─────────────────────────────────────────────


async function generateGemma(prompt) {
  const response = await getAI().models.generateContent({
    model: "gemma-4-31b",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 1.0,
    },
  });
  return response.text?.trim() ?? null;
}

async function generateGemmaVision(prompt, imageUrl) {
  const imgRes    = await fetch(imageUrl);
  const imgBuf    = await imgRes.arrayBuffer();
  const imgBase64 = Buffer.from(imgBuf).toString("base64");
  const mimeType  = imgRes.headers.get("content-type") ?? "image/png";

  const response = await getAI().models.generateContent({
  model: "gemma-4-31b",
  contents: [{
    role: "user",
    parts: [
      { text: prompt },
      { inlineData: { mimeType, data: imgBase64 } },
    ],
  }],
  config: {
    temperature: 1.2,
  },
});
  return response.text?.trim() ?? null;
}
async function generateGeminiFlash(prompt) {
  const { generateWithFallback } = require("../utils/ai");
  const response = await generateWithFallback({
    model: "gemini-3.1-flash-lite-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text?.trim() ?? null;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

async function prepare(ctx) {
  const isSlash = !!ctx.interaction;
  if (isSlash) {
    await ctx.interaction.deferReply();
    return (payload) => ctx.interaction.editReply(payload);
  }
  return (payload) => ctx.send(payload);
}

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

// ─────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────

const data = {
  data: new GroupBuilder({
    name: "fun",
    description: "Comandos de personalidad y diversión",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })

  // ── OPINION ───────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "opinion",
      description: "Pide mi opinión sin filtro sobre algo",
    }),
    params: new ParamsBuilder()
      .addString({
        name: "tema",
        description: "¿Sobre qué quieres mi opinión?",
        required: true,
      }),

    async code(ctx) {
      const reply = await prepare(ctx);
      const tema  = ctx.get("tema");

      try {
        const texto = (await generateGeminiFlash(
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
        console.error("[fun opinion]", err);
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── CRITICA ───────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "critica",
      description: "Te doy una crítica despiadada de algo",
    }),
    params: new ParamsBuilder()
      .addString({
        name: "tema",
        description: "¿Qué quieres que critique?",
        required: true,
      }),

    async code(ctx) {
      const reply = await prepare(ctx);
      const tema  = ctx.get("tema");

      try {
        const texto = (await generateGeminiFlash(
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
        console.error("[fun critica]", err);
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── EXCUSA ────────────────────────────────────
.addCommand({
  data: new CommandBuilder({
    name: "excusa",
    description: "Genera una excusa ridícula pero creativa",
  }),

  params: new ParamsBuilder()
    .addString({
      name: "situacion",
      description: "¿Para qué necesitas la excusa?",
      required: false,
    }),

  async code(ctx) {
    const reply = await prepare(ctx);

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
      console.error("[fun excusa]", err);

      await reply({
        content: "Ocurrió un error con la IA, intenta de nuevo",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
})

  // ── TEORIA ────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "teoria",
      description: "Una teoría conspirativa sobre cualquier cosa",
    }),
    params: new ParamsBuilder()
      .addString({
        name: "tema",
        description: "¿Sobre qué quieres la teoría?",
        required: true,
      }),

    async code(ctx) {
      const reply = await prepare(ctx);
      const tema  = ctx.get("tema");

      try {
        const texto = (await generateGeminiFlash(
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
        console.error("[fun teoria]", err);
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── ROAST ─────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "roast",
      description: "Critica despiadadamente a un usuario",
    }),
    params: new ParamsBuilder()
      .addMember({
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

      const reply = await prepare(ctx);

      try {
        const target = ctx.get("usuario") ?? ctx.member;
        if (!target) return reply({ content: "No pude obtener la información del usuario", flags: MessageFlags.Ephemeral });

        const user     = target.user;
        const username = user.globalName ?? user.username;
        const usertag  = user.username;

        const ahoraMs     = Date.now();
        const createdHace = msATexto(ahoraMs - user.createdTimestamp);
        const createdDate = new Date(user.createdTimestamp).toLocaleDateString("es-ES", { year: "numeric", month: "long" });
        const joinedHace  = target.joinedTimestamp ? msATexto(ahoraMs - target.joinedTimestamp) : null;
        const joinedDate  = target.joinedTimestamp
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

        const avatarUrl = user.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
        const texto     = (await generateGemmaVision(prompt, avatarUrl))?.slice(0, 4000)
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
        console.error("[fun roast]", err);
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── LOL ───────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "lol",
      description: "Ríete de algo así bien jaja",
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      await ctx.send("😂🖕");
    },
  }),
};

module.exports = { data };
