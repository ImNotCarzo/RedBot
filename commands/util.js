const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("erine");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const GuildConfig = require("../models/GuildConfig");
const prefixCache = require("../utils/prefixCache");
const { deleteConversacion } = require("../utils/askMemory");

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

const RED    = "#ff383d";
const GREEN  = "#23a55a";

const INVITE_URL    = "https://discord.com/oauth2/authorize?client_id=1020772849906098186";
const SUPPORT_URL   = "https://discord.gg/b8AKKaNWU6";

// ─────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────

const data = {
  data: new GroupBuilder({
    name: "util",
    description: "Comandos de utilidad general",
    guildOnly: false,
    as_prefix: false,
    as_slash: true,
  })

  // ── PING ──────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "ping",
      description: "Muestra la latencia del bot",
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      try {
        const before = Date.now();
        const sent   = await ctx.send({ content: "..." });
        const msgPing = Date.now() - before;
        const apiPing = ctx.bot?.ws?.ping ?? 0;

        await sent.edit({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setTitle("Pong!")
              .setDescription(
                `> **Mensaje:** \`${msgPing}ms\`\n` +
                `> **API:** \`${apiPing}ms\``
              )
              .setColor(RED),
          ],
        });
      } catch (err) {
        console.error("[util ping]", err);
        await ctx.send({ content: "Algo salió mal", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── INVITE ────────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "invite",
      description: "Obtén los links de invitación del bot",
      aliases: ["inv"],
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      try {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Invitar")
            .setStyle(ButtonStyle.Link)
            .setURL(INVITE_URL),
          new ButtonBuilder()
            .setLabel("Soporte")
            .setStyle(ButtonStyle.Link)
            .setURL(SUPPORT_URL),
        );

        await ctx.send({ content: INVITE_URL, components: [row] });
      } catch (err) {
        console.error("[util invite]", err);
        await ctx.send({ content: "Algo salió mal", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── SETPREFIX ─────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "setprefix",
      description: "Cambia o muestra el prefix del bot en este servidor",
    }),
    params: new ParamsBuilder()
      .addString({
        name: "nuevo",
        description: "Nuevo prefix (omitir para ver el actual)",
        required: false,
      }),

    async code(ctx) {
      try {
        if (!ctx.guild)
          return ctx.send({ content: "Este comando solo funciona en servidores", flags: MessageFlags.Ephemeral });

        if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator))
          return ctx.send({ content: "Necesitás el permiso `Administrator`", flags: MessageFlags.Ephemeral });

        const nuevo = ctx.get("nuevo");

        // Sin argumento → mostrar prefix actual
        if (!nuevo) {
          const config = await GuildConfig.findOne({ guildId: ctx.guild.id });
          const prefix = config?.prefix ?? ".";
          return ctx.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("Prefix actual")
                .setDescription(`\`${prefix}\``)
                .setColor(RED),
            ],
          });
        }

        if (nuevo.length > 3)
          return ctx.send({ content: "El prefix no puede tener más de 3 caracteres", flags: MessageFlags.Ephemeral });

        await GuildConfig.findOneAndUpdate(
          { guildId: ctx.guild.id },
          { prefix: nuevo },
          { upsert: true }
        );

        prefixCache.set(ctx.guild.id, nuevo);

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Prefix actualizado")
              .setDescription(`Nuevo prefix: \`${nuevo}\``)
              .setColor(GREEN),
          ],
        });
      } catch (err) {
        console.error("[util setprefix]", err);
        await ctx.send({ content: "No se pudo cambiar el prefix", flags: MessageFlags.Ephemeral });
      }
    },
  })

  // ── ASKRESET ──────────────────────────────────
  .addCommand({
    data: new CommandBuilder({
      name: "askreset",
      description: "Limpia tu historial de conversación con la IA",
      aliases: ["reset"],
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      const userId = ctx.user?.id ?? ctx.author?.id;
      deleteConversacion(userId);
      await ctx.send({ content: "Historial borrado" });
    },
  }),
};

module.exports = { data };
