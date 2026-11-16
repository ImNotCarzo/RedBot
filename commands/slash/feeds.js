const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins, ComponentsV2Builder, V2Text } = require("gralonium");
const { RED, GREEN } = require("../../src/config");
const { SocialFeed } = require("../../src/database");
const { dispatchFeedNotification, fetchLatestForFeed, PLATFORM_LIMITS } = require("../../src/feeds");
const { noGuildReply, THINKING_TEXT } = require("../../src/runtime");

const ADMIN_PLUGINS = [Plugins.hasPerms("ManageGuild")];

const data = {
  data: new GroupBuilder({
    name: "feeds",
    description: "Alertas instantáneas de YouTube, Twitch, Kick, TikTok y Reddit",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "add", description: "Suscribe un canal de Discord a notificaciones sociales" }),
      params: new ParamsBuilder()
        .addString({
          name: "plataforma",
          description: "Red o plataforma social",
          required: true,
          choices: [
            { name: "YouTube", value: "youtube" },
            { name: "Twitch", value: "twitch" },
            { name: "Kick", value: "kick" },
            { name: "TikTok", value: "tiktok" },
            { name: "Reddit", value: "reddit" },
          ],
        })
        .addString({ name: "cuenta", description: "Usuario, @handle, channel_id o subreddit (ej: r/memes)", required: true })
        .addChannel({ name: "canal", description: "Canal de Discord donde publicar alertas", required: true })
        .addString({ name: "mensaje", description: "Mensaje personalizado ({author}, {url}, {title})", required: false }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const platform = ctx.get("plataforma");
        const account = String(ctx.get("cuenta") ?? "").trim().slice(0, 128);
        const channel = ctx.get("canal");
        if (!channel?.isTextBased?.()) return ctx.ephemeral("El canal debe ser de texto");

        const existing = await SocialFeed.findOne({ guildId: ctx.guild.id, platform, account: account.toLowerCase() }).lean();
        if (!existing) {
          const count = await SocialFeed.countDocuments({ guildId: ctx.guild.id, platform });
          const max = PLATFORM_LIMITS[platform] ?? 10;
          if (count >= max) {
            return ctx.ephemeral(`Alcanzaste el límite de ${max} feeds de **${platform}** en este servidor`);
          }
        }

        await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
        const latest = await fetchLatestForFeed(platform, account).catch(() => null);

        await SocialFeed.findOneAndUpdate(
          { guildId: ctx.guild.id, platform, account: account.toLowerCase() },
          {
            $set: {
              channelId: channel.id,
              customMessage: String(ctx.get("mensaje") ?? "").slice(0, 1000),
              lastItemId: latest?.itemId ?? null,
              isLive: Boolean(latest?.isLive),
            },
          },
          { upsert: true, returnDocument: "after" }
        );

        await ctx.send(ComponentsV2Builder.card({
          title: "Alerta social configurada",
          fields: [
            ["Plataforma", V2Text.code(platform)],
            ["Cuenta", V2Text.code(account)],
            ["Canal", `${channel}`],
            ["Estado inicial", latest ? V2Text.code(latest.isLive ? "En directo" : "Sincronizado") : V2Text.code("Pendiente")],
          ],
          color: GREEN,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "remove", description: "Elimina una alerta social configurada" }),
      params: new ParamsBuilder()
        .addString({
          name: "plataforma",
          description: "Plataforma",
          required: true,
          choices: [
            { name: "YouTube", value: "youtube" },
            { name: "Twitch", value: "twitch" },
            { name: "Kick", value: "kick" },
            { name: "TikTok", value: "tiktok" },
            { name: "Reddit", value: "reddit" },
          ],
        })
        .addString({ name: "cuenta", description: "Cuenta o subreddit a quitar", required: true }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const platform = ctx.get("plataforma");
        const account = String(ctx.get("cuenta") ?? "").trim().toLowerCase();
        const res = await SocialFeed.deleteOne({ guildId: ctx.guild.id, platform, account });
        if (!res.deletedCount) return ctx.ephemeral("No encontré esa alerta social");
        await ctx.send(ComponentsV2Builder.card({ title: "Alerta eliminada", description: `Se quitó **${platform}** · \`${account}\`.`, color: RED }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "list", description: "Lista las alertas sociales activas del servidor" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const list = await SocialFeed.find({ guildId: ctx.guild.id }).sort({ platform: 1 }).lean();
        if (!list.length) return ctx.ephemeral("No hay alertas sociales configuradas");
        await ctx.send(ComponentsV2Builder.card({
          title: "Alertas sociales activas",
          description: list.map((f) => `• **${f.platform}** \`${f.account}\` → <#${f.channelId}>`).join("\n"),
          color: RED,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "test", description: "Prueba manualmente una alerta social y muestra su última publicación" }),
      params: new ParamsBuilder()
        .addString({
          name: "plataforma",
          description: "Plataforma",
          required: true,
          choices: [
            { name: "YouTube", value: "youtube" },
            { name: "Twitch", value: "twitch" },
            { name: "Kick", value: "kick" },
            { name: "TikTok", value: "tiktok" },
            { name: "Reddit", value: "reddit" },
          ],
        })
        .addString({ name: "cuenta", description: "Cuenta o subreddit", required: true }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        await ctx.defer({ thinking: true, thinkingText: THINKING_TEXT, color: RED });
        const platform = ctx.get("plataforma");
        const account = String(ctx.get("cuenta") ?? "").trim();
        const latest = await fetchLatestForFeed(platform, account).catch(() => null);
        if (!latest || latest.offline) {
          return ctx.ephemeral(latest?.offline ? "El canal está desconectado (offline) ahora mismo." : "No pude obtener publicaciones recientes de esa cuenta.");
        }
        await dispatchFeedNotification(ctx.bot?.client ?? ctx.guild.client, { channelId: ctx.channel.id, customMessage: "" }, latest);
        await ctx.ephemeral("Prueba enviada");
      },
    }),
};

module.exports = { data };
