const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { generateWithFallback } = require("../utils/ai");

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

const RED = "#ff383d";

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

// ─────────────────────────────────────────────
//  AI
// ─────────────────────────────────────────────
async function generateGemini(prompt) {
  const response = await generateWithFallback({
    model: "gemini-3.1-flash-lite-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text?.trim() ?? null;
}

async function generateGemma(messages, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemma-3-4b-it:free",
          messages,
        }),
      });

      const data = await res.json();

      if (data.error?.message?.includes("Provider returned error") && attempt < retries) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      return data.choices?.[0]?.message?.content?.trim() ?? null;

    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
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
  if (años >= 1)  return `${años} año${años > 1 ? "s" : ""}`;
  if (mes >= 1)   return `${mes} mes${mes > 1 ? "es" : ""}`;
  if (dias >= 1)  return `${dias} día${dias > 1 ? "s" : ""}`;
  if (hrs >= 1)   return `${hrs} hora${hrs > 1 ? "s" : ""}`;
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
        const texto = (await generateGemini(
          `${PERSONA}\nDa tu opinión personal, sarcástica y sin filtro sobre: "${tema}". Máximo 3 párrafos, sin introducción genérica, ve directo al punto.`
        ))?.slice(0, 4000) ?? "No pude generar una opinión";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Mi opinión sobre: ${tema}`)
              .setDescription(texto)
              .setColor(RED)
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
        const texto = (await generateGemini(
          `${PERSONA}\nHaz una crítica directa, ingeniosa y sin piedad de: "${tema}". Señala sus puntos débiles con humor y sarcasmo. Máximo 3 párrafos, sin introducción genérica.`
        ))?.slice(0, 4000) ?? "No pude generar una crítica";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Crítica de: ${tema}`)
              .setDescription(texto)
              .setColor(RED)
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
      const reply     = await prepare(ctx);
      const situacion = ctx.get("situacion") ?? "cualquier situación";

      try {
        const texto = (await generateGemini(
          `${PERSONA}\nGenera una excusa ridícula, creativa y medianamente plausible para: "${situacion}". Que sea graciosa, original y tenga una narrativa interesante. Máximo 2 párrafos.`
        ))?.slice(0, 4000) ?? "No pude generar una excusa";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Tu excusa profesional")
              .setDescription(texto)
              .setColor(RED)
              .setTimestamp(),
          ],
        });
      } catch (err) {
        console.error("[fun excusa]", err);
        await reply({ content: "Ocurrió un error con la IA, intenta de nuevo", flags: MessageFlags.Ephemeral });
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
        const texto = (await generateGemini(
          `${PERSONA}\nCrea una teoría conspirativa ridícula pero internamente consistente sobre: "${tema}". Preséntala como si fuera verdad, con "evidencia" inventada y conexiones absurdas. Máximo 3 párrafos, sin aclarar que es ficción.`
        ))?.slice(0, 4000) ?? "No pude generar una teoría";

        await reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Teoría: ${tema}`)
              .setDescription(texto)
              .setColor(RED)
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
      const joinedHace  = target.joinedTimestamp
        ? msATexto(ahoraMs - target.joinedTimestamp)
        : null;
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
        activity ? `Jugando/escuchando: ${activity}` : null,
        `Roles: ${roles}`,
        `Permisos notables: ${perms}`,
        `Insignias: ${badges}`,
      ].filter(Boolean).join("\n");

      const prompt = `${PERSONA}

Vas a hacer un roast brutal y personalizado de este usuario de Discord.
Que sea sin filtro, sin limites, roastealo brutalmente.
Tienes su foto de perfil y sus datos, usa ambas cosas.

Reglas:
- SOLO EN ESPAÑOL. Cero palabras en otro idioma.
- 3 párrafos. Máximo 4.
- Específico: usá los datos reales, no generalidades.
- No menciones los permisos como tal, por ejemplo BanMembers, di algo como, permisos para banear, administrador... etc.
- Sin mencionar timestamps, IDs ni código técnico. Solo información humana.
- Sin frases de relleno al inicio ni al final. Arrancá directo con el roast.
- No menciones @usuario en el roast, por ejemplo "Sigue ahí, @RedBot", evita eso.
- No redundes, ni hagas resumenes finales, haz que sea lo mas despiadado posible.

Datos del usuario:
${datosUsuario}`;

      const avatarUrl = user.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });

      const texto = (await generateGemma([{
        role: "user",
        content: [
          { type: "text",      text: prompt },
          { type: "image_url", image_url: { url: avatarUrl } },
        ],
      }]))?.slice(0, 4000) ?? "Ocurrió un error con la IA, intenta de nuevo";

      await reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Roast de ${username}`)
            .setThumbnail(avatarUrl)
            .setDescription(texto)
            .setColor(RED)
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
