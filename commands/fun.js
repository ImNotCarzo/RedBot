const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder, MessageFlags } = require("discord.js");

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
//  HEALER
// ─────────────────────────────────────────────

async function generateHealer(prompt, imageUrl = null) {
  const content = imageUrl
    ? [
        { type: "text",      text: prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : prompt;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/healer-alpha",
      messages: [{ role: "user", content }],
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  }

  return data.choices?.[0]?.message?.content?.trim() ?? null;
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
        const prompt = `${PERSONA}\nDa tu opinión personal, sarcástica y sin filtro sobre: "${tema}". Máximo 3 párrafos, sin introducción genérica, ve directo al punto.`;
        const texto  = (await generateHealer(prompt))?.slice(0, 4000) ?? "No pude generar una opinión";

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
        const prompt = `${PERSONA}\nHaz una crítica directa, ingeniosa y sin piedad de: "${tema}". Señala sus puntos débiles con humor y sarcasmo. Máximo 3 párrafos, sin introducción genérica.`;
        const texto  = (await generateHealer(prompt))?.slice(0, 4000) ?? "No pude generar una crítica";

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
      const reply     = await prepare(ctx);
      const situacion = ctx.get("situacion") ?? "cualquier situación";

      try {
        const prompt = `${PERSONA}\nGenera una excusa ridícula, creativa y medianamente plausible para: "${situacion}". Que sea graciosa, original y tenga una narrativa interesante. Máximo 2 párrafos.`;
        const texto  = (await generateHealer(prompt))?.slice(0, 4000) ?? "No pude generar una excusa";

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
        const prompt = `${PERSONA}\nCrea una teoría conspirativa ridícula pero internamente consistente sobre: "${tema}". Preséntala como si fuera verdad, con "evidencia" inventada y conexiones absurdas. Máximo 3 párrafos, sin aclarar que es ficción.`;
        const texto  = (await generateHealer(prompt))?.slice(0, 4000) ?? "No pude generar una teoría";

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
        const perms  = target.permissions?.toArray()?.filter(p => PERMS_RELEVANTES.includes(p))?.join(", ") || "ninguno";
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
Reglas estrictas:
- RESPONDE ÚNICAMENTE EN ESPAÑOL. Ninguna palabra en otro idioma.
- Mínimo 3 párrafos, máximo 4. No seas corto.
- Sarcasmo, humor negro e ingenio. Sin amenazas reales.
- Analiza la foto de perfil en detalle, describe qué ves y úsalo para burlarte.
- Usa los datos del perfil para ataques específicos, no genéricos.
- Nada de frases genéricas como "eres el típico usuario que...".
- El roast debe sentirse personalizado, no una plantilla.

Datos del usuario:
${datosUsuario}`;

        const avatarUrl = user.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
        const texto     = (await generateHealer(prompt, avatarUrl))?.slice(0, 4000)
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
  }),
};

module.exports = { data };
