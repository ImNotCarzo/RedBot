const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins, ComponentsV2Builder, V2Text } = require("gralonium");
const { RED, GREEN } = require("../../src/config");
const { Ticket } = require("../../src/database");
const { getCurrentLang } = require("../../src/i18n");
const { Logger, noGuildReply } = require("../../src/runtime");
const {
  buildTicketPanelPayload,
  closeTicketChannel,
  generateTicketTranscript,
  getTicketConfig,
  openTicket,
  parseTicketMenuOptions,
  sendTicketSetupPanel,
  updateTicketConfig,
} = require("../../src/tickets");

const log = new Logger("CMD_TICKETS", process.env.LOG_LEVEL);
const ADMIN_PLUGINS = [Plugins.hasPerms("ManageGuild")];

const data = {
  data: new GroupBuilder({
    name: "tickets",
    description: "Sistema de tickets de soporte y transcripciones",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "setup", description: "Configura categoría, rol de soporte y canal de transcripciones" }),
      params: new ParamsBuilder()
        .addChannel({ name: "categoria", description: "Categoría donde se crearán los tickets", required: false })
        .addChannel({ name: "logs", description: "Canal donde guardar transcripciones", required: false })
        .addRole({ name: "rol_soporte", description: "Rol del equipo de soporte", required: false })
        .addString({ name: "mensaje", description: "Mensaje de bienvenida dentro del ticket", required: false }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const cat = ctx.get("categoria");
        const logs = ctx.get("logs");
        const role = ctx.get("rol_soporte");
        const msg = ctx.get("mensaje");

        const patch = { enabled: true };
        if (cat) {
          if (cat.type !== ChannelType.GuildCategory) return ctx.ephemeral("La categoría debe ser un canal de tipo Categoría");
          patch.categoryId = cat.id;
        }
        if (logs) {
          if (!logs.isTextBased?.()) return ctx.ephemeral("El canal de logs debe ser un canal de texto");
          patch.logChannelId = logs.id;
        }
        if (role) patch.supportRoleId = role.id;
        if (msg) patch.welcomeMessage = msg.slice(0, 1500);

        let cfg = null;
        if (Object.keys(patch).length > 1 || cat || logs || role || msg) {
          cfg = await updateTicketConfig(ctx.guild.id, patch);
        } else {
          cfg = await getTicketConfig(ctx.guild.id);
        }

        await sendTicketSetupPanel(ctx, { initialCfg: cfg });
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "panel", description: "Envía un panel interactivo para abrir tickets en un canal" }),
      params: new ParamsBuilder()
        .addChannel({ name: "canal", description: "Canal donde enviar el panel (opcional, por defecto actual)", required: false })
        .addString({ name: "titulo", description: "Título del panel", required: false })
        .addString({ name: "descripcion", description: "Descripción del panel", required: false })
        .addString({ name: "categoria", description: "Etiqueta o motivo del botón (ej: Soporte)", required: false })
        .addString({ name: "boton", description: "Texto del botón o placeholder del menú", required: false })
        .addString({ name: "opciones", description: "Opciones del menú separadas por ; (emoji|Nombre|Subtexto|Detalle)", required: false }),
      plugins: [...ADMIN_PLUGINS, Plugins.hasBotPerms("ManageChannels")],
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const ch = ctx.get("canal") ?? ctx.channel;
        if (!ch?.isTextBased?.()) return ctx.ephemeral("Canal inválido");
        const opcionesRaw = ctx.get("opciones");
        const parsedOptions = parseTicketMenuOptions(opcionesRaw);
        const buttonOrPlaceholder = ctx.get("boton");
        if (parsedOptions.length) {
          await updateTicketConfig(ctx.guild.id, {
            enabled: true,
            categories: parsedOptions,
            ...(buttonOrPlaceholder ? { panelPlaceholder: String(buttonOrPlaceholder).slice(0, 100) } : {}),
          });
        }
        const payload = buildTicketPanelPayload({
          title: ctx.get("titulo"),
          description: ctx.get("descripcion"),
          category: ctx.get("categoria") || "General",
          buttonLabel: parsedOptions.length ? null : buttonOrPlaceholder,
          placeholder: parsedOptions.length ? buttonOrPlaceholder : null,
          options: parsedOptions.length ? parsedOptions : null,
          lang: getCurrentLang(),
        });
        await ch.send(payload);
        await ctx.ephemeral(`Panel de tickets enviado en ${ch}`);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "create", description: "Abre un ticket de soporte" }),
      params: new ParamsBuilder().addString({ name: "motivo", description: "Motivo o categoría (opcional)", required: false }),
      plugins: [Plugins.hasBotPerms("ManageChannels")],
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        await ctx.defer({ ephemeral: true });
        const res = await openTicket({ guild: ctx.guild, user: ctx.user, category: ctx.get("motivo") || "General" });
        if (res.error === "already_open") return ctx.ephemeral(`Ya tienes un ticket abierto en <#${res.channelId}>`);
        if (!res.ok) return ctx.ephemeral("No se pudo abrir el ticket");
        await ctx.ephemeral(`Ticket creado en <#${res.channel.id}>`);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "close", description: "Cierra el ticket actual y guarda su transcripción" }),
      params: new ParamsBuilder().addString({ name: "motivo", description: "Motivo de cierre (opcional)", required: false }),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        await ctx.defer({ ephemeral: true });
        const ticket = await Ticket.findOne({ channelId: ctx.channel.id, status: "open" }).lean();
        if (!ticket) return ctx.ephemeral("Este canal no es un ticket activo");
        const cfg = await getTicketConfig(ctx.guild.id);
        const isStaff = ctx.member?.permissions?.has(PermissionFlagsBits.ManageChannels) || (cfg.supportRoleId && ctx.member?.roles?.cache?.has(cfg.supportRoleId));
        if (!isStaff && ctx.user.id !== ticket.openerId) {
          return ctx.ephemeral("No tienes permisos para cerrar este ticket");
        }
        await ctx.ephemeral("Guardando transcripción y cerrando ticket...");
        await closeTicketChannel({ channel: ctx.channel, closedByUser: ctx.user, reason: ctx.get("motivo") });
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "add", description: "Añade a un usuario al ticket actual" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Usuario a añadir", required: true }),
      plugins: [Plugins.hasBotPerms("ManageChannels")],
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const ticket = await Ticket.findOne({ channelId: ctx.channel.id, status: "open" }).lean();
        if (!ticket) return ctx.ephemeral("Este canal no es un ticket activo");
        const member = ctx.get("usuario");
        await ctx.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await ctx.send(ComponentsV2Builder.card({ title: "Usuario añadido", description: `${member} fue añadido al ticket.`, color: GREEN }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "remove", description: "Quita el acceso de un usuario al ticket actual" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Usuario a retirar", required: true }),
      plugins: [Plugins.hasBotPerms("ManageChannels")],
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const ticket = await Ticket.findOne({ channelId: ctx.channel.id, status: "open" }).lean();
        if (!ticket) return ctx.ephemeral("Este canal no es un ticket activo");
        const member = ctx.get("usuario");
        await ctx.channel.permissionOverwrites.delete(member.id);
        await ctx.send(ComponentsV2Builder.card({ title: "Usuario retirado", description: `${member} ya no tiene acceso al ticket.`, color: RED }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "claim", description: "Reclama el ticket actual como miembro del equipo" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const ticket = await Ticket.findOne({ channelId: ctx.channel.id, status: "open" }).lean();
        if (!ticket) return ctx.ephemeral("Este canal no es un ticket activo");
        await Ticket.updateOne({ channelId: ctx.channel.id }, { $set: { claimedBy: ctx.user.id } });
        await ctx.send(ComponentsV2Builder.card({ title: "Ticket reclamado", description: `Atendido por ${ctx.user}.`, color: GREEN }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "transcript", description: "Exporta el historial completo (.html y .txt) del ticket actual" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        await ctx.defer();
        const ticket = await Ticket.findOne({ channelId: ctx.channel.id }).lean();
        if (!ticket) return ctx.ephemeral("Este canal no es un ticket registrado");
        try {
          const t = await generateTicketTranscript(ctx.channel, ticket);
          await ctx.send({
            content: `Transcripción exportada (**${t.count}** mensajes).`,
            files: [t.htmlAttachment, t.txtAttachment],
          });
        } catch (err) {
          log.error("[tickets transcript]", { err: err?.message });
          await ctx.ephemeral("No se pudo generar la transcripción");
        }
      },
    }),
};

module.exports = { data };
