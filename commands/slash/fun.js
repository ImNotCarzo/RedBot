const { GroupBuilder, CommandBuilder, ParamsBuilder, ComponentsV2Builder, V2Text } = require("gralonium");
const { Logger, THINKING_TEXT, noGuildReply, handleCommandError } = require("../../src/runtime");
const { generateText, generateVision, fetchImageAsInlineData } = require("../../src/ai");
const { RED, BADGE_NAMES, USER_APP_CONFIG } = require("../../src/config");
const { getLang } = require("../../src/guild");
const { detectLocaleLang } = require("../../src/i18n");

const log = new Logger("CMD_FUN", process.env.LOG_LEVEL);

const PERSONA = `Eres RedBot, un bot de Discord con personalidad sarcástica, ingeniosa e irreverente.
Hablas español neutro e informal, sin voseo, sin "usted", sin formalismos.
Sin emojis salvo que realmente sumen. Sin frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!".
Respuestas concisas, con personalidad, directas al grano.
RESPONDE SIEMPRE EN ESPAÑOL. Ninguna palabra en otro idioma.`;

const PERSONA_EN = `You are RedBot, a Discord bot with a sarcastic, witty, and irreverent personality.
Speak casual, punchy English with zero corporate politeness.
No emojis unless they genuinely add punch. Never say "Sure!", "Of course!", "Understood!".
Concise, opinionated answers straight to the point.
RESPOND ALWAYS IN ENGLISH. Not a single word in another language.`;

async function resolveCtxLang(ctx) {
  if (ctx?.guild?.id) return getLang(ctx.guild.id);
  return detectLocaleLang(ctx?.interaction?.locale ?? ctx?.interaction?.guildLocale);
}

function getPersona(lang) {
  return lang === "en" ? PERSONA_EN : PERSONA;
}

function msATexto(ms, lang = "es") {
  const min = Math.floor(ms / 60000);
  const hrs = Math.floor(min / 60);
  const dias = Math.floor(hrs / 24);
  const mes = Math.floor(dias / 30);
  const anos = Math.floor(dias / 365);
  if (lang === "en") {
    if (anos >= 1) return `${anos} year${anos > 1 ? "s" : ""}`;
    if (mes >= 1) return `${mes} month${mes > 1 ? "s" : ""}`;
    if (dias >= 1) return `${dias} day${dias > 1 ? "s" : ""}`;
    if (hrs >= 1) return `${hrs} hour${hrs > 1 ? "s" : ""}`;
    return `${min} minute${min > 1 ? "s" : ""}`;
  }
  if (anos >= 1) return `${anos} año${anos > 1 ? "s" : ""}`;
  if (mes >= 1) return `${mes} mes${mes > 1 ? "es" : ""}`;
  if (dias >= 1) return `${dias} día${dias > 1 ? "s" : ""}`;
  if (hrs >= 1) return `${hrs} hora${hrs > 1 ? "s" : ""}`;
  return `${min} minuto${min > 1 ? "s" : ""}`;
}

async function runTextFunCommand(ctx, { logTag, buildPrompt, prompt, fallbackText, title, footerText }) {
  await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
  try {
    const lang = await resolveCtxLang(ctx);
    const resolvedPrompt = typeof buildPrompt === "function" ? buildPrompt(lang, getPersona(lang)) : prompt;
    const raw = await generateText(resolvedPrompt);
    const resolvedTitle = typeof title === "function" ? title(lang) : title;
    const resolvedFallback = typeof fallbackText === "function" ? fallbackText(lang) : fallbackText;
    const resolvedFooter = typeof footerText === "function" ? footerText(lang) : footerText;
    const card = ComponentsV2Builder.card({
      title: resolvedTitle,
      description: raw || resolvedFallback,
      footer: resolvedFooter,
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
    description: "Comandos de entretenimiento, humor e IA",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
    ...USER_APP_CONFIG,
  })
    .addCommand({
      data: new CommandBuilder({
        name: "opinion",
        description: "Genera una opinión sarcástica sobre un tema",
      }),
      params: new ParamsBuilder().addString({
        name: "tema",
        description: "Tema a opinar",
        required: true,
      }),
      async code(ctx) {
        const tema = ctx.get("tema");
        await runTextFunCommand(ctx, {
          logTag: "[fun opinion]",
          buildPrompt: (lang, persona) =>
            lang === "en"
              ? `${persona}\nGive your personal, sarcastic, unfiltered opinion on: "${tema}". Max 3 paragraphs, no generic intro, straight to the point.`
              : `${persona}\nDa tu opinión personal, sarcástica y sin filtro sobre: "${tema}". Máximo 3 párrafos, sin introducción genérica, ve directo al punto.`,
          fallbackText: (lang) => (lang === "en" ? "I couldn't generate an opinion" : "No pude generar una opinión"),
          title: (lang) => (lang === "en" ? `My opinion on: ${tema}` : `Mi opinión sobre: ${tema}`),
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "critica",
        description: "Genera una crítica directa e irónica sobre un tema",
      }),
      params: new ParamsBuilder().addString({
        name: "tema",
        description: "Tema a criticar",
        required: true,
      }),
      async code(ctx) {
        const tema = ctx.get("tema");
        await runTextFunCommand(ctx, {
          logTag: "[fun critica]",
          buildPrompt: (lang, persona) =>
            lang === "en"
              ? `${persona}\nDeliver a sharp, witty, merciless critique of: "${tema}". Mock its weak spots with humor and sarcasm. Max 3 paragraphs, no generic intro.`
              : `${persona}\nHaz una crítica directa, ingeniosa y sin piedad de: "${tema}". Señala sus puntos débiles con humor y sarcasmo. Máximo 3 párrafos, sin introducción genérica.`,
          fallbackText: (lang) => (lang === "en" ? "I couldn't generate a critique" : "No pude generar una crítica"),
          title: (lang) => (lang === "en" ? `Review of: ${tema}` : `Crítica de: ${tema}`),
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "excusa",
        description: "Genera una excusa creativa o absurda",
      }),
      params: new ParamsBuilder().addString({
        name: "situacion",
        description: "Situación o contexto (opcional)",
        required: false,
      }),
      async code(ctx) {
        const rawSituacion = ctx.get("situacion")?.trim();
        await runTextFunCommand(ctx, {
          logTag: "[fun excusa]",
          buildPrompt: (lang, persona) => {
            if (lang === "en") {
              return rawSituacion
                ? `${persona}\nCreate a ridiculous, creative, half-plausible excuse for: "${rawSituacion}". Make it funny, original, and narrative. Max 2 paragraphs.`
                : `${persona}\nCreate a ridiculous, creative, hilarious excuse for any situation. Make it original and narrative. Max 2 paragraphs.`;
            }
            return rawSituacion
              ? `${persona}\nGenera una excusa ridícula, creativa y medianamente plausible para: "${rawSituacion}". Que sea graciosa, original y tenga narrativa. Máximo 2 párrafos.`
              : `${persona}\nGenera una excusa ridícula, creativa y divertida para cualquier situación. Que sea graciosa, original y tenga narrativa. Máximo 2 párrafos.`;
          },
          fallbackText: (lang) => (lang === "en" ? "I couldn't generate an excuse" : "No pude generar una excusa"),
          title: (lang) => (lang === "en" ? "Your professional excuse" : "Tu excusa profesional"),
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "teoria",
        description: "Genera una teoría conspirativa sobre un tema",
      }),
      params: new ParamsBuilder().addString({
        name: "tema",
        description: "Tema de la teoría",
        required: true,
      }),
      async code(ctx) {
        const tema = ctx.get("tema");
        await runTextFunCommand(ctx, {
          logTag: "[fun teoria]",
          buildPrompt: (lang, persona) =>
            lang === "en"
              ? `${persona}\nInvent a ridiculous yet internally consistent conspiracy theory about: "${tema}". Present it dead seriously with fabricated "evidence" and absurd connections. Max 3 paragraphs, never state it is fiction.`
              : `${persona}\nCrea una teoría conspirativa ridícula pero internamente consistente sobre: "${tema}". Preséntala como si fuera verdad, con "evidencia" inventada y conexiones absurdas. Máximo 3 párrafos, sin aclarar que es ficción.`,
          fallbackText: (lang) => (lang === "en" ? "I couldn't generate a theory" : "No pude generar una teoría"),
          title: (lang) => (lang === "en" ? `Theory: ${tema}` : `Teoría: ${tema}`),
          footerText: (lang) => (lang === "en" ? "This is fiction... or maybe not." : "Esto es ficción... o quizás no."),
        });
      },
    })
    .addCommand({
      data: new CommandBuilder({
        name: "roast",
        description: "Genera un roast humorístico del perfil de un usuario",
      }),
      params: new ParamsBuilder().addMember({
        name: "usuario",
        description: "Usuario objetivo (opcional)",
        required: false,
      }),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);

        await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });

        try {
          const lang = await resolveCtxLang(ctx);
          const isEn = lang === "en";
          const baseTarget = ctx.get("usuario") ?? ctx.member;
          if (!baseTarget) {
            return ctx.ephemeral(isEn ? "I couldn't fetch that user's info" : "No pude obtener la información del usuario");
          }

          // Precarga miembro (roles, presencia, ingreso) y foto antes de generar, para evitar fallos iniciales
          const target = await ctx.guild.members.fetch({ user: baseTarget.id, force: true }).catch(() => baseTarget);
          const user = await target.user.fetch(true).catch(() => target.user);
          const avatarUrl = user.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
          const imagePart = await fetchImageAsInlineData(avatarUrl).catch(() => fetchImageAsInlineData(avatarUrl)).catch(() => null);
          const username = user.globalName ?? user.username;
          const usertag = user.username;

          const ahoraMs = Date.now();
          const localeTag = isEn ? "en-US" : "es-ES";
          const createdHace = msATexto(ahoraMs - user.createdTimestamp, lang);
          const createdDate = new Date(user.createdTimestamp).toLocaleDateString(localeTag, { year: "numeric", month: "long" });
          const joinedHace = target.joinedTimestamp ? msATexto(ahoraMs - target.joinedTimestamp, lang) : null;
          const joinedDate = target.joinedTimestamp
            ? new Date(target.joinedTimestamp).toLocaleDateString(localeTag, { year: "numeric", month: "long" })
            : null;

          const activity = target.presence?.activities?.[0]?.name ?? null;
          const status = target.presence?.status ?? "offline";

          const noneLabel = isEn ? "none" : "ninguno";
          const roles = target.roles?.cache
            ?.filter((r) => r.id !== ctx.guild.id)
            ?.map((r) => r.name)
            ?.slice(0, 8)
            ?.join(", ") || noneLabel;

          const PERMS_RELEVANTES = [
            "Administrator", "ManageGuild", "ManageMessages",
            "ManageRoles", "BanMembers", "KickMembers", "ModerateMembers",
          ];
          const perms = target.permissions?.toArray()?.filter((p) => PERMS_RELEVANTES.includes(p))?.join(", ") || noneLabel;
          const badges = user.flags?.toArray()?.map((f) => BADGE_NAMES[f] ?? f)?.join(", ") || (isEn ? "none" : "ninguna");

          const datosUsuario = isEn
            ? [
                `Name: ${username} (@${usertag})`,
                `Account created: ${createdHace} ago (${createdDate})`,
                joinedHace ? `Joined server: ${joinedHace} ago (${joinedDate})` : "Joined server: unknown",
                `Status: ${status}`,
                activity ? `Activity: ${activity}` : null,
                `Roles: ${roles}`,
                `Notable permissions: ${perms}`,
                `Badges: ${badges}`,
              ].filter(Boolean).join("\n")
            : [
                `Nombre: ${username} (@${usertag})`,
                `Cuenta creada: hace ${createdHace} (${createdDate})`,
                joinedHace ? `Entró al servidor: hace ${joinedHace} (${joinedDate})` : "Entró al servidor: desconocido",
                `Estado: ${status}`,
                activity ? `Actividad: ${activity}` : null,
                `Roles: ${roles}`,
                `Permisos notables: ${perms}`,
                `Insignias: ${badges}`,
              ].filter(Boolean).join("\n");

          const prompt = isEn
            ? `${getPersona("en")}
Your task is to BRUTALLY ROAST this Discord user.
Sarcasm, dark humor, and sharp wit. No real threats. Never generic.
Use the profile facts and avatar image to mock specific details. Max 3 paragraphs.
${datosUsuario}`
            : `${getPersona("es")}
Tu tarea es ROASTEAR brutalmente a este usuario de Discord.
Sarcasmo, humor negro e ingenio. Sin amenazas reales. Sin ser genérico.
Usa los datos y la foto para burlarte de cosas específicas. Máximo 3 párrafos.
${datosUsuario}`;

          const generated = imagePart ? await generateVision(prompt, imagePart) : await generateText(prompt);
          const card = ComponentsV2Builder.card({
            title: isEn ? `Roast of ${username}` : `Roast de ${username}`,
            subtitle: V2Text.subtext(`@${usertag}`),
            description: generated || (isEn ? "AI error occurred, please try again" : "Ocurrió un error con la IA, intenta de nuevo"),
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
        description: "Selecciona una opción aleatoria de una lista",
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
          const lang = await resolveCtxLang(ctx);
          const isEn = lang === "en";
          const raw = (ctx.get("opciones") ?? "").trim();
          let items = [];
          if (raw.includes("|")) {
            items = raw.split("|");
          } else if (raw.includes(",")) {
            items = raw.split(",");
          } else if (/\s+(?:o|or)\s+/i.test(raw)) {
            items = raw.split(/\s+(?:o|or)\s+/i);
          } else {
            items = raw.split(/\s+/);
          }

          items = items.map((s) => s.trim()).filter(Boolean);
          if (items.length < 2) {
            return ctx.ephemeral(
              isEn
                ? "Give me at least 2 options to pick from (separate with `,` or `|`)"
                : "Debes darme al menos 2 opciones para elegir (sepáralas con `,` o `|`)"
            );
          }

          const eleccion = items[Math.floor(Math.random() * items.length)];

          const card = ComponentsV2Builder.card({
            title: isEn ? "Decision made" : "Decisión tomada",
            fields: [
              [isEn ? "Options" : "Opciones", items.map((i) => V2Text.code(i)).join(", ")],
              [isEn ? "Choice" : "Elección", `**${eleccion}**`],
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
        description: "Reacción rápida de risa irónica",
      }),
      params: new ParamsBuilder(),
      async code(ctx) {
        await ctx.send("😂🖕");
      },
    }),
};

module.exports = { data };
