const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { Logger, prepareReply, noGuildReply, handleCommandError } = require("../../src/runtime");
const { generateText, generateVision, fetchImageAsInlineData } = require("../../src/ai");
const { RED } = require("../../src/config");

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
  const reply = await prepareReply(ctx, { thinking: true });
  try {
    const raw = await generateText(prompt);
    const texto = raw?.slice(0, 4000) || fallbackText;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(texto)
      .setColor(RED)
      .setTimestamp();
    if (footerText) embed.setFooter({ text: footerText });
    await reply({ embeds: [embed] });
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

        const reply = await prepareReply(ctx, { thinking: true });

        try {
          const baseTarget = ctx.get("usuario") ?? ctx.member;
          if (!baseTarget) return reply({ content: "No pude obtener la información del usuario", flags: MessageFlags.Ephemeral });

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

          const generated = imagePart ? await generateVision(prompt, imagePart) : await generateText(prompt);
          const texto = generated?.slice(0, 4000)
            ?? "Ocurrió un error con la IA, intenta de nuevo";

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
          log.error("[fun roast]", { err: err?.message ?? String(err) });
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
