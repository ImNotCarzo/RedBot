const { CommandBuilder, ParamsBuilder } = require("erine");
const { EmbedBuilder } = require("discord.js");
const { GoogleGenAI } = require("@google/genai");
const { MAX_HISTORIAL, setConversacion, getConversacion } = require("../utils/askMemory");

const SYSTEM_PROMPT = `Eres RedBot, un asistente dentro de un bot de Discord.
Personalidad: sarcástico, ingenioso e irreverente pero sin pasarte de la raya, tampoco seas super arrogante.
Hablas como un amigo que sabe mucho, no como un manual técnico ni un bot genérico.
Hablas español neutro, sin regionalismos de ningún país específico. Usas español informal y neutro, sin voseo de base o algun otro tipo de acento, sin "usted" y sin formalismos, amenos que el usuario te escriba asi, por ejemplo si usa voseo le respondes con eso, sino neutral.
Sin emojis salvo que realmente sumen al mensaje.
Si alguien pregunta algo obvio lo respondes con un toque de "en serio me preguntas eso?".
Si alguien te insulta respondes con ingenio, no con sumisión.
Si la pregunta es técnica la respondes bien pero sin sonar a wikipedia.
Jamás uses frases como "¡Claro!", "¡Por supuesto!", "¡Entendido!" ni nada por el estilo.
Respondes en el mismo idioma que el usuario.
Mantén el contexto de la conversación.
Solo menciona comandos si el usuario los pide o es claramente necesario. Los comandos disponibles son:
</ping:1089312705833336953> </setprefix:1474627923817402579> </botinfo:1474564029673509048> </invite:1475002638884929658> </user info:1424461603155480666> </user avatar:1474662271732154475> </user roles:1474662271732154475> </user banner:1474662271732154475> </server info:1475008186091311164> </server logo:1475008186091311164> </server emojis:1475008186091311164> </server roles:1475008186091311164>`;

const GEMINI_KEYS = [process.env.GEMINI, process.env.GEMINI2].filter(Boolean);
let currentKey = 0;

function getAI() {
  return new GoogleGenAI({ apiKey: GEMINI_KEYS[currentKey] });
}

function rotateKey() {
  currentKey = (currentKey + 1) % GEMINI_KEYS.length;
  console.log(`[AI] Rotando a key ${currentKey + 1}`);
}

function toGeminiHistory(historial) {
  return historial.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

async function needsSearchAI(pregunta) {
  try {
    const res = await getAI().models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{
        role: "user",
        parts: [{ text: `Answer only YES or NO. Does this question require current or real-time information from the internet (news, weather, sports results, prices, events, updates)?\nQuestion: ${pregunta}` }]
      }]
    });
    return res.text.trim().toLowerCase().includes("yes");
  } catch {
    // Si falla la detección, asumir que no necesita search
    return false;
  }
}

async function generateWithFallback(params) {
  try {
    return await getAI().models.generateContent(params);
  } catch (err) {
    if (err.status === 429 && GEMINI_KEYS.length > 1) {
      rotateKey();
      return await getAI().models.generateContent(params);
    }
    throw err;
  }
}

const data = {
  data: new CommandBuilder({
    name: "ask",
    description: "Hazle una pregunta a la IA",
    aliases: ["ia", "ai"],
    guildOnly: false,
    as_prefix: true,
    as_slash: true,
  }),
  params: new ParamsBuilder().addString({
    name: "pregunta",
    description: "¿Qué quieres preguntar?",
    required: true,
  }),

  async code(ctx) {
    try {
      const pregunta = ctx.interaction
        ? ctx.get("pregunta")
        : ctx.args?.join(" ").trim();
      if (!pregunta) return ctx.send("Necesito una pregunta");

      const userId = ctx.user?.id ?? ctx.author?.id;
      const username = ctx.user?.username ?? ctx.author?.username;
      const invoker = ctx.user ?? ctx.author;
      const isSlash = !!ctx.interaction;

      let thinking;
      if (isSlash) {
        await ctx.interaction.deferReply();
      } else {
        thinking = await ctx.send({ content: "..." });
      }

      const prev = getConversacion(userId);
      const historial = prev?.historial ?? [];
      historial.push({ role: "user", content: pregunta });

      // Detección y respuesta en paralelo para ahorrar tiempo
      const [usarSearch] = await Promise.all([needsSearchAI(pregunta)]);

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
        .setColor("Red");

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
        await ctx.interaction.editReply("Algo salió mal, intentá de nuevo").catch(() => {});
      } else {
        await ctx.send("Me ratelimiteó google, f");
      }
    }
  },
};

module.exports = { data };