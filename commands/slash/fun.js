const { GroupBuilder, CommandBuilder, ParamsBuilder, ComponentsV2Builder, V2Text } = require("gralonium");
const { Logger, THINKING_TEXT, noGuildReply, handleCommandError } = require("../../src/runtime");
const { generateText, generateVision, fetchImageAsInlineData } = require("../../src/ai");
const { RED, BADGE_NAMES } = require("../../src/config");

const log = new Logger("CMD_FUN", process.env.LOG_LEVEL);

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

function msATexto(ms) {
  const min = Math.floor(ms / 60000);
  const hrs = Math.floor(min / 60);
  const dias = Math.floor(hrs / 24);
  const mes = Math.floor(dias / 30);
  const años = Math.floor(dias / 365);
  if (años >= 1) return `${años} año${años > 1 ? "s" : ""}`;
  if (mes >= 1) return `${mes} mes${mes > 1 ? "es" : ""}`;
  if (dias >= 1) return `${dias} día${dias > 1 ? "s" : ""}`;
  if (hrs >= 1) return `${hrs} hora${hrs > 1 ? "s" : ""}`;
  return `${min} minuto${min > 1 ? "s" : ""}`;
}

async function runTextFunCommand(ctx, { logTag, prompt, fallbackText, title, footerText }) {
  await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
  try {
    const raw = await generateText(prompt);
    const card = ComponentsV2Builder.card({
      title,
      description: raw || fallbackText,
      footer: footerText,
      color: RED,
    });
    await ctx.send(card);
  } catch (err) {
    log.error(logTag, { err: err?.message ?? String(err) });
    handleCommandError(ctx, err);
  }
}

const data = {
  data: new GroupBuilder({
    name: "fun",
    description: "Comandos de personalidad y diversión",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
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
        const tema = ctx.get("tema");
        await runTextFunCommand(ctx, {
          logTag: "[fun opinion]",
          prompt: `${PERSONA}\nDa tu opinión personal, sarcástica y sin filtro sobre: "${tema}". Máximo 3 párrafos, sin introducción genérica, ve directo al punto.`,
          fallbackText: "No pude generar una opinión",
          title: `Mi opinión sobre: ${tema}`,
        });
      },
    })
    .addCommand({
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
        const tema = ctx.get("tema");
        await runTextFunCommand(ctx, {
          logTag: "[fun critica]",
          prompt: `${PERSONA}\nHaz una crítica directa, ingeniosa y sin piedad de: "${tema}". Señala sus puntos débiles con humor y sarcasmo. Máximo 3 párrafos, sin introducción genérica.`,
          fallbackText: "No pude generar una crítica",
          title: `Crítica de: ${tema}`,
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "excusa",
        description: "Genera una excusa ridícula pero creativa",
      }),
      params: new ParamsBuilder().addString({
        name: "situacion",
        description: "¿Para qué necesitas la excusa?",
        required: false,
      }),
      async code(ctx) {
        const situacion = ctx.get("situacion")?.trim() || "cualquier situación";
        const prompt =
          situacion === "cualquier situación"
            ? `${PERSONA}\nGenera una excusa ridícula, creativa y divertida para cualquier situación. Que sea graciosa, original y tenga narrativa. Máximo 2 párrafos.`
            : `${PERSONA}\nGenera una excusa ridícula, creativa y medianamente plausible para: "${situacion}". Que sea graciosa, original y tenga narrativa. Máximo 2 párrafos.`;

        await runTextFunCommand(ctx, {
          logTag: "[fun excusa]",
          prompt,
          fallbackText: "No pude generar una excusa",
          title: "Tu excusa profesional",
        });
      },
    })
    .addCommand({
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
        const tema = ctx.get("tema");
        await runTextFunCommand(ctx, {
          logTag: "[fun teoria]",
          prompt: `${PERSONA}\nCrea una teoría conspirativa ridícula pero internamente consistente sobre: "${tema}". Preséntala como si fuera verdad, con "evidencia" inventada y conexiones absurdas. Máximo 3 párrafos, sin aclarar que es ficción.`,
          fallbackText: "No pude generar una teoría",
          title: `Teoría: ${tema}`,
          footerText: "Esto es ficción... o quizás no.",
        });
      },
    })
    .addCommand({
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
        if (!ctx.guild) return noGuildReply(ctx);

        await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });

        try {
          const baseTarget = ctx.get("usuario") ?? ctx.member;
          if (!baseTarget) return ctx.ephemeral("No pude obtener la información del usuario");

          // Precarga miembro (roles, presencia, ingreso) y foto antes de generar, para evitar fallos iniciales
          const target = await ctx.guild.members.fetch({ user: baseTarget.id, force: true }).catch(() => baseTarget);
          const user = await target.user.fetch(true).catch(() => target.user);
          const avatarUrl = user.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
          const imagePart = await fetchImageAsInlineData(avatarUrl).catch(() => fetchImageAsInlineData(avatarUrl)).catch(() => null);
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
          const badges = user.flags?.toArray()?.map((f) => BADGE_NAMES[f] ?? f)?.join(", ") || "ninguna";

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

          const generated = imagePart ? await generateVision(prompt, imagePart) : await generateText(prompt);
          const card = ComponentsV2Builder.card({
            title: `Roast de ${username}`,
            subtitle: V2Text.subtext(`@${usertag}`),
            description: generated || "Ocurrió un error con la IA, intenta de nuevo",
            thumbnail: avatarUrl,
            color: RED,
          });

          await ctx.send(card);
        } catch (err) {
          log.error("[fun roast]", { err: err?.message ?? String(err) });
          handleCommandError(ctx, err);
        }
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "choose",
        description: "Elige una opción al azar entre varias",
        aliases: ["elegir", "escoger", "pick"],
      }),
      params: new ParamsBuilder().addString({
        name: "opciones",
        description: "Opciones separadas por coma (,) o barra (|)",
        required: true,
      }),
      async code(ctx) {
        await ctx.defer();
        try {
          const raw = (ctx.get("opciones") ?? "").trim();
          let items = [];
          if (raw.includes("|")) {
            items = raw.split("|");
          } else if (raw.includes(",")) {
            items = raw.split(",");
          } else if (/\s+o\s+/i.test(raw)) {
            items = raw.split(/\s+o\s+/i);
          } else {
            items = raw.split(/\s+/);
          }

          items = items.map((s) => s.trim()).filter(Boolean);
          if (items.length < 2) {
            return ctx.ephemeral("Debes darme al menos 2 opciones para elegir (sepáralas con `,` o `|`)");
          }

          const eleccion = items[Math.floor(Math.random() * items.length)];

          const card = ComponentsV2Builder.card({
            title: "Decisión tomada",
            fields: [
              ["Opciones", items.map((i) => V2Text.code(i)).join(", ")],
              ["Elección", `**${eleccion}**`],
            ],
            fieldsSeparator: false,
            color: RED,
          });

          await ctx.send(card);
        } catch (err) {
          log.error("[fun choose]", { err: err?.message ?? String(err) });
          handleCommandError(ctx, err);
        }
      },
    })
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
