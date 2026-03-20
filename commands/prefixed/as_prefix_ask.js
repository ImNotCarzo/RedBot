const { CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { generateWithFallback, needsSearchAI, toGeminiHistory } = require("../utils/ai");
const { MAX_HISTORIAL, setConversacion, getConversacion } = require("../utils/askMemory");
const { RED } = require("../utils/colors");

const SYSTEM_PROMPT = `Eres RedBot, un asistente dentro de un bot de Discord.
Personalidad: sarcástico, ingenioso e irreverente pero sin pasarte de la raya, tampoco seas super arrogante.
Hablas como un amigo que sabe mucho, no como un manual técnico ni un bot genérico.
Hablas español neutro, sin regionalismos de ningún país específico. Usas español informal y neutro, sin voseo de base o algún otro tipo de acento, sin "usted" y sin formalismos, a menos que el usuario te escriba así, por ejemplo si usa voseo le respondes con eso, sino neutral.
Sin emojis salvo que realmente sumen al mensaje.
Si alguien pregunta algo obvio lo respondes con un toque de "en serio me preguntas eso?".
Si alguien te insulta respondes con ingenio, no con sumisión.
Si la pregunta es técnica la respondes bien pero sin sonar a wikipedia.
Jamás uses frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!" ni nada por el estilo.
Respondes en el mismo idioma que el usuario.
Mantén el contexto de la conversación.
Solo menciona comandos si el usuario los pide o es claramente necesario. Los comandos disponibles son:
</ask:1481436920075649278> </util ping:1481436920075649286> </util botinfo:1481436920075649286> </util invite:1481436920075649286> </util setprefix:1481436920075649286> </util askreset:1481436920075649286> </user info:1481436920075649285> </user avatar:1481436920075649285> </user banner:1481436920075649285> </user roles:1481436920075649285> </user permissions:1481436920075649285> </server info:1481436920075649284> </server logo:1481436920075649284> </server banner:1481436920075649284> </server emojis:1481436920075649284> </server roles:1481436920075649284> </mod ban:1481436920075649282> </mod unban:1481436920075649282> </mod softban:1481436920075649282> </mod tempban:1481436920075649282> </mod massban:1481436920075649282> </mod kick:1481436920075649282> </mod mute:1481436920075649282> </mod unmute:1481436920075649282> </mod purge:1481436920075649282> </mod warn:1481436920075649282> </mod removewarn:1481436920075649282> </mod clearwarns:1481436920075649282> </mod warnings:1481436920075649282> </mod setlogs:1481436920075649282> </mod removelogs:1481436920075649282> </role info:1481436920075649283> </role icon:1481436920075649283> </role color:1481436920075649283> </role users:1481436920075649283> </role add:1481436920075649283> </role remove:1481436920075649283> </role rename:1481436920075649283> </role hoist:1481436920075649283> </role mentionable:1481436920075649283> </channel info:1481436920075649280> </channel rename:1481436920075649280> </channel lock:1481436920075649280> </channel unlock:1481436920075649280> </channel slowmode:1481436920075649280> </channel nuke:1481436920075649280> </channel clone:1481436920075649280> </channel permit:1481436920075649280> </channel deny:1481436920075649280> </channel hide:1481436920075649280> </fun opinion:1481436920075649281> </fun critica:1481436920075649281> </fun excusa:1481436920075649281> </fun teoria:1481436920075649281> </fun roast:1481436920075649281>`;

const data = {
  data: new CommandBuilder({
    name: "ask",
    description: "Hazle una pregunta a la IA",
    aliases: ["ia", "ai"],
    guildOnly: false,
    as_prefix: true,
    as_slash: false,
  }),
  params: new ParamsBuilder().addString({
    name: "pregunta",
    description: "¿Qué quieres preguntar?",
    required: false,
  }),

  async code(ctx) {
    const pregunta = ctx.interaction
      ? ctx.get("pregunta")
      : ctx.args?.join(" ").trim();

    if (!pregunta) {
      const bot = ctx.bot.user;
      const paramerror = new EmbedBuilder()
        .setAuthor({ name: "Comando Ask", iconURL: bot.displayAvatarURL() })
        .setDescription(
          `**Usos:**\nHazle una pregunta a la IA` +
          `\n\n**Aliases:**\n\`ia\`, \`ai\`` +
          `\n\n\`\`\`js\n.ask <pregunta>\nEjemplo: .ask cuando te apagan\`\`\``
        )
        .setColor(RED);

      return ctx.send({ embeds: [paramerror] });
    }

    try {
      const userId = ctx.user?.id ?? ctx.author?.id;
      const username = ctx.user?.username ?? ctx.author?.username;
      const invoker = ctx.user ?? ctx.author;
      const isSlash = !!ctx.interaction;

      let thinking;
      if (isSlash) {
        await ctx.interaction.deferReply();
      } else {
        thinking = await ctx.send({ content: "<a:typing:1484407380291616778>  RedBot está pensando..." });
      }

      const prev = getConversacion(userId);
      const historial = prev?.historial ?? [];
      historial.push({ role: "user", content: pregunta });

      const usarSearch = await needsSearchAI(pregunta);

      const model = usarSearch ? "gemini-2.5-flash" : "gemini-3.1-flash-lite-preview";
      const config = usarSearch ? { tools: [{ googleSearch: {} }] } : {};

      const response = await generateWithFallback({
        model,
        contents: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Entendido." }] },
          ...toGeminiHistory(historial),
        ],
        config,
      });

      const respuesta = response.text ?? "No pude generar una respuesta";
      historial.push({ role: "assistant", content: respuesta });
      if (historial.length > MAX_HISTORIAL) historial.splice(0, historial.length - MAX_HISTORIAL);

      const texto = respuesta.length > 4000
        ? respuesta.slice(0, 4000) + "\n*(respuesta recortada)*"
        : respuesta;

      const embed = new EmbedBuilder()
        .setAuthor({ name: username, iconURL: invoker?.displayAvatarURL({ size: 128 }) })
        .setDescription(texto)
        .setColor("#ff383d");

      if (isSlash) {
        await ctx.interaction.editReply({ embeds: [embed] });
        const sent = await ctx.interaction.fetchReply();
        setConversacion(userId, historial, sent.id);
      } else {
        await thinking.edit({ content: "", embeds: [embed] });
        setConversacion(userId, historial, thinking.id);
      }

    } catch (err) {
      console.error("Error en ask:", err);
      if (ctx.interaction) {
        await ctx.interaction.editReply("Algo salió mal, intenta de nuevo").catch(() => {});
      } else {
        await ctx.send("Ocurrió un error, intenta de nuevo");
      }
    }
  },
};

module.exports = { data };
