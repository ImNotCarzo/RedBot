const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins, ComponentsV2Builder, V2Text } = require("gralonium");
const { RED, GREEN } = require("../../src/config");
const {
  MAX_CUSTOM_COMMANDS,
  MAX_EMBED_TEMPLATES,
  MAX_RULES,
  MAX_TIMERS,
  invalidateAutoRulesCache,
  invalidateCustomCommandsCache,
  isSafeRegexPattern,
} = require("../../src/automation");
const { AutoRule, AutoTimer, CustomCommand, EmbedTemplate } = require("../../src/database");
const { parseDuration, formatDuration } = require("../../src/moderation");
const { noGuildReply } = require("../../src/runtime");
const { createStandardListPaginator } = require("../../src/shared/ui");
const { validateRoleHierarchy } = require("../../src/shared/utils");
const { renderEmbedTemplate } = require("../../src/tagscript");

const ADMIN_PLUGINS = [Plugins.hasPerms("ManageGuild")];

function validateManageableRole(ctx, role) {
  return validateRoleHierarchy(ctx, role, {
    requireUserManageRoles: true,
    userPermMsg: "Necesitas el permiso **Administrar roles** para configurar acciones de rol",
  });
}

function isValidTemplateUrl(raw) {
  if (!raw) return true;
  if (/^\{[^}]+\}$/.test(raw)) return true;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const data = {
  data: new GroupBuilder({
    name: "auto",
    description: "Comandos personalizados, TagScript, embeds, temporizadores y reglas",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "cmdadd", description: "Crea un comando personalizado o auto-respuesta con TagScript (hasta 500)" }),
      params: new ParamsBuilder()
        .addString({ name: "disparador", description: "Nombre del comando o texto activador", required: true })
        .addString({ name: "respuesta", description: "Texto / TagScript ({user}, {server}, {if(...)}, {embed:...})", required: true })
        .addString({
          name: "tipo",
          description: "Cómo se activa",
          required: false,
          choices: [
            { name: "Exacto (prefijo)", value: "exact" },
            { name: "Empieza con", value: "startswith" },
            { name: "Contiene", value: "contains" },
            { name: "Regex", value: "regex" },
          ],
        })
        .addString({ name: "embed", description: "Nombre de plantilla embed a adjuntar (opcional)", required: false }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const trigger = String(ctx.get("disparador") ?? "").trim().toLowerCase().slice(0, 64);
        const response = String(ctx.get("respuesta") ?? "").trim().slice(0, 2000);
        const matchType = ctx.get("tipo") || "exact";
        const templateName = ctx.get("embed") ? String(ctx.get("embed")).trim().toLowerCase() : null;

        if (!trigger) return ctx.ephemeral("Indica un disparador válido");
        if (matchType === "regex" && !isSafeRegexPattern(trigger)) {
          return ctx.ephemeral("Ese regex no es válido o es demasiado pesado. Simplifícalo o usa `contains`.");
        }

        const roleTagMatches = [...response.matchAll(/\{(?:addrole|removerole):(\d{17,20})\}/gi)];
        let canRoles = false;
        if (roleTagMatches.length) {
          for (const [, roleId] of roleTagMatches) {
            const role = ctx.guild.roles.cache.get(roleId) ?? null;
            const roleErr = validateManageableRole(ctx, role);
            if (roleErr) return ctx.ephemeral(roleErr);
          }
          canRoles = true;
        } else {
          canRoles = Boolean(ctx.member?.permissions?.has?.("ManageRoles"));
        }

        const existing = await CustomCommand.findOne({ guildId: ctx.guild.id, trigger }).lean();
        if (!existing) {
          const count = await CustomCommand.countDocuments({ guildId: ctx.guild.id });
          if (count >= MAX_CUSTOM_COMMANDS) {
            return ctx.ephemeral(`Alcanzaste el límite de ${MAX_CUSTOM_COMMANDS} comandos personalizados`);
          }
        }

        await CustomCommand.findOneAndUpdate(
          { guildId: ctx.guild.id, trigger },
          { $set: { matchType, response, templateName, authorId: ctx.user.id, grantRoleAllowed: canRoles } },
          { upsert: true, returnDocument: "after" }
        );
        invalidateCustomCommandsCache(ctx.guild.id);

        await ctx.send(ComponentsV2Builder.card({
          title: "Comando personalizado guardado",
          fields: [
            ["Disparador", V2Text.code(trigger)],
            ["Tipo", V2Text.code(matchType)],
            templateName ? ["Embed", V2Text.code(templateName)] : null,
            ["Respuesta", V2Text.clip(response, 300)],
          ].filter(Boolean),
          color: GREEN,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "cmdremove", description: "Elimina un comando personalizado" }),
      params: new ParamsBuilder().addString({ name: "disparador", description: "Nombre/activador a eliminar", required: true }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const trigger = String(ctx.get("disparador") ?? "").trim().toLowerCase();
        const res = await CustomCommand.deleteOne({ guildId: ctx.guild.id, trigger });
        if (!res.deletedCount) return ctx.ephemeral("No encontré ese comando personalizado");
        invalidateCustomCommandsCache(ctx.guild.id);
        await ctx.send(ComponentsV2Builder.card({ title: "Comando eliminado", description: `Se borró \`${trigger}\`.`, color: RED }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "cmdlist", description: "Lista los comandos personalizados del servidor" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const list = await CustomCommand.find({ guildId: ctx.guild.id }).sort({ trigger: 1 }).lean();
        if (!list.length) return ctx.ephemeral("No hay comandos personalizados en este servidor");

        const rows = list.map((c) => `• \`${c.trigger}\` (${c.matchType})${c.templateName ? ` · Embed \`${c.templateName}\`` : ""}`);
        const paginator = createStandardListPaginator({
          items: rows,
          ownerId: ctx.user?.id,
          perPage: 12,
          title: `Comandos personalizados (${list.length}/${MAX_CUSTOM_COMMANDS})`,
        });
        await paginator.send(ctx);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "embedadd", description: "Guarda una plantilla de Embed reutilizable (hasta 500)" }),
      params: new ParamsBuilder()
        .addString({ name: "nombre", description: "Nombre corto de la plantilla (sin espacios)", required: true })
        .addString({ name: "descripcion", description: "Contenido principal (soporta TagScript)", required: true })
        .addString({ name: "titulo", description: "Título del embed (opcional)", required: false })
        .addString({ name: "color", description: "Color hex (ej: #ff383d)", required: false })
        .addString({ name: "imagen", description: "URL de imagen grande (opcional)", required: false })
        .addString({ name: "thumbnail", description: "URL de miniatura (opcional)", required: false })
        .addString({ name: "footer", description: "Texto del pie (opcional)", required: false }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const name = String(ctx.get("nombre") ?? "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 64);
        if (!name) return ctx.ephemeral("Indica un nombre válido");
        const exists = await EmbedTemplate.findOne({ guildId: ctx.guild.id, name }).lean();
        if (!exists) {
          const count = await EmbedTemplate.countDocuments({ guildId: ctx.guild.id });
          if (count >= MAX_EMBED_TEMPLATES) {
            return ctx.ephemeral(`Alcanzaste el límite de ${MAX_EMBED_TEMPLATES} plantillas embed`);
          }
        }

        const rawColor = String(ctx.get("color") ?? RED).trim();
        if (!/^#?[0-9a-f]{6}$/i.test(rawColor)) {
          return ctx.ephemeral("Color hex inválido (usa el formato `#ff383d`)");
        }
        const normalizedColor = rawColor.startsWith("#") ? rawColor : `#${rawColor}`;
        const image = String(ctx.get("imagen") ?? "").trim();
        const thumbnail = String(ctx.get("thumbnail") ?? "").trim();
        if (!isValidTemplateUrl(image) || !isValidTemplateUrl(thumbnail)) {
          return ctx.ephemeral("Las URLs de imagen y miniatura deben comenzar con `http://` o `https://`");
        }

        const doc = await EmbedTemplate.findOneAndUpdate(
          { guildId: ctx.guild.id, name },
          {
            $set: {
              title: String(ctx.get("titulo") ?? "").slice(0, 256),
              description: String(ctx.get("descripcion") ?? "").slice(0, 4000),
              color: normalizedColor,
              image,
              thumbnail,
              footer: String(ctx.get("footer") ?? "").slice(0, 2048),
            },
          },
          { upsert: true, returnDocument: "after" }
        ).lean();

        const preview = renderEmbedTemplate(doc, { user: ctx.user, member: ctx.member, guild: ctx.guild, channel: ctx.channel });
        await ctx.send({ content: `Plantilla \`${name}\` guardada:`, embeds: [preview] });
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "embedview", description: "Previsualiza o envía una plantilla de Embed guardada" }),
      params: new ParamsBuilder()
        .addString({ name: "nombre", description: "Nombre de la plantilla", required: true })
        .addChannel({ name: "canal", description: "Canal donde enviarla (opcional)", required: false }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const name = String(ctx.get("nombre") ?? "").trim().toLowerCase();
        const doc = await EmbedTemplate.findOne({ guildId: ctx.guild.id, name }).lean();
        if (!doc) return ctx.ephemeral("No encontré esa plantilla embed");
        const embed = renderEmbedTemplate(doc, { user: ctx.user, member: ctx.member, guild: ctx.guild, channel: ctx.channel });
        const ch = ctx.get("canal");
        if (ch?.isTextBased?.()) {
          await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
          return ctx.ephemeral(`Embed \`${name}\` enviado en ${ch}`);
        }
        await ctx.send({ embeds: [embed] });
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "embedremove", description: "Elimina una plantilla de Embed" }),
      params: new ParamsBuilder().addString({ name: "nombre", description: "Nombre de la plantilla", required: true }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const name = String(ctx.get("nombre") ?? "").trim().toLowerCase();
        const res = await EmbedTemplate.deleteOne({ guildId: ctx.guild.id, name });
        if (!res.deletedCount) return ctx.ephemeral("No encontré esa plantilla embed");
        await ctx.send(ComponentsV2Builder.card({ title: "Plantilla eliminada", description: `Se borró \`${name}\`.`, color: RED }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "embedlist", description: "Lista todas las plantillas de Embed del servidor" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const list = await EmbedTemplate.find({ guildId: ctx.guild.id }).sort({ name: 1 }).lean();
        if (!list.length) return ctx.ephemeral("No hay plantillas embed guardadas");
        const rows = list.map((e) => `• \`${e.name}\` — ${V2Text.clip(e.title || e.description, 60)}`);
        const paginator = createStandardListPaginator({
          items: rows,
          ownerId: ctx.user?.id,
          perPage: 12,
          title: `Plantillas Embed (${list.length}/${MAX_EMBED_TEMPLATES})`,
        });
        await paginator.send(ctx);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "timeradd", description: "Crea un mensaje automático recurrente en un canal (hasta 100)" }),
      params: new ParamsBuilder()
        .addChannel({ name: "canal", description: "Canal destino", required: true })
        .addString({ name: "intervalo", description: "Cada cuánto enviar (ej: 15m, 1h, 6h, 1d)", required: true })
        .addString({ name: "mensaje", description: "Texto del mensaje (opcional si indicas embed)", required: false })
        .addString({ name: "embed", description: "Nombre de plantilla embed (opcional)", required: false }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const channel = ctx.get("canal");
        if (!channel?.isTextBased?.()) return ctx.ephemeral("Ese no es un canal de texto. Elige uno.");
        const intervalMs = parseDuration(ctx.get("intervalo"));
        if (!intervalMs || intervalMs < 60_000 || intervalMs > 30 * 86_400_000) {
          return ctx.ephemeral("El intervalo debe estar entre `1m` y `30d`");
        }
        const message = String(ctx.get("mensaje") ?? "").trim().slice(0, 2000);
        const templateName = ctx.get("embed") ? String(ctx.get("embed")).trim().toLowerCase() : null;
        if (!message && !templateName) return ctx.ephemeral("Debes indicar un mensaje o una plantilla embed");

        const count = await AutoTimer.countDocuments({ guildId: ctx.guild.id });
        if (count >= MAX_TIMERS) return ctx.ephemeral(`Alcanzaste el límite de ${MAX_TIMERS} temporizadores`);

        const timerId = Math.random().toString(36).slice(2, 8).toUpperCase();
        await AutoTimer.create({
          guildId: ctx.guild.id,
          timerId,
          channelId: channel.id,
          intervalMs,
          nextRunAt: new Date(Date.now() + intervalMs),
          message,
          templateName,
          enabled: true,
        });

        await ctx.send(ComponentsV2Builder.card({
          title: "Mensaje automático creado",
          fields: [
            ["ID", V2Text.code(timerId)],
            ["Canal", `${channel}`],
            ["Cada", V2Text.code(formatDuration(intervalMs))],
          ],
          color: GREEN,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "timerremove", description: "Elimina un mensaje automático recurrente por su ID" }),
      params: new ParamsBuilder().addString({ name: "id", description: "ID del temporizador", required: true }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const timerId = String(ctx.get("id") ?? "").trim().toUpperCase();
        const res = await AutoTimer.deleteOne({ guildId: ctx.guild.id, timerId });
        if (!res.deletedCount) return ctx.ephemeral("No existe ningún temporizador con ese ID. Consulta los activos con `/auto timerlist`.");
        await ctx.send(ComponentsV2Builder.card({ title: "Temporizador eliminado", description: `Se borró \`${timerId}\`.`, color: RED }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "timerlist", description: "Lista los mensajes automáticos recurrentes del servidor" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const list = await AutoTimer.find({ guildId: ctx.guild.id }).lean();
        if (!list.length) return ctx.ephemeral("No hay mensajes recurrentes configurados");
        const rows = list.map((t) => `• \`${t.timerId}\` en <#${t.channelId}> cada \`${formatDuration(t.intervalMs)}\``);
        const paginator = createStandardListPaginator({
          items: rows,
          ownerId: ctx.user?.id,
          perPage: 12,
          title: `Temporizadores (${list.length}/${MAX_TIMERS})`,
        });
        await paginator.send(ctx);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "ruleadd", description: "Crea una regla lógica de automatización del servidor (hasta 50)" }),
      params: new ParamsBuilder()
        .addString({ name: "nombre", description: "Nombre corto de la regla", required: true })
        .addString({
          name: "evento",
          description: "Evento disparador",
          required: true,
          choices: [
            { name: "Mensaje enviado", value: "message" },
            { name: "Miembro nuevo", value: "member_join" },
            { name: "Entra a voz", value: "voice_join" },
          ],
        })
        .addString({
          name: "condicion",
          description: "Condición a evaluar",
          required: true,
          choices: [
            { name: "Siempre", value: "always" },
            { name: "Mensaje contiene texto", value: "contains" },
            { name: "Tiene rol (ID)", value: "has_role" },
            { name: "Es bot", value: "is_bot" },
            { name: "No es bot", value: "not_bot" },
            { name: "En canal (ID)", value: "in_channel" },
            { name: "Cuenta menor a X días", value: "account_age_lt_days" },
          ],
        })
        .addString({
          name: "accion",
          description: "Acción a ejecutar",
          required: true,
          choices: [
            { name: "Enviar mensaje en canal", value: "send_channel" },
            { name: "Enviar DM al usuario", value: "send_dm" },
            { name: "Dar rol (ID)", value: "add_role" },
            { name: "Quitar rol (ID)", value: "remove_role" },
            { name: "Borrar mensaje", value: "delete_message" },
          ],
        })
        .addString({ name: "valor_condicion", description: "Valor para la condición (texto, ID o días)", required: false })
        .addString({ name: "valor_accion", description: "Texto, ID de rol o canalId|mensaje", required: false }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const name = String(ctx.get("nombre") ?? "").trim().toLowerCase().slice(0, 64);
        if (!name) return ctx.ephemeral("Indica un nombre válido");
        const actionType = ctx.get("accion");
        const actionValue = String(ctx.get("valor_accion") ?? "").slice(0, 1500);
        if (actionType === "add_role" || actionType === "remove_role") {
          const roleId = actionValue.replace(/[<@&>]/g, "").trim();
          const role = ctx.guild.roles.cache.get(roleId) ?? null;
          const roleErr = validateManageableRole(ctx, role);
          if (roleErr) return ctx.ephemeral(roleErr);
        }

        const existing = await AutoRule.findOne({ guildId: ctx.guild.id, name }).lean();
        if (!existing) {
          const count = await AutoRule.countDocuments({ guildId: ctx.guild.id });
          if (count >= MAX_RULES) return ctx.ephemeral(`Alcanzaste el límite de ${MAX_RULES} reglas`);
        }

        await AutoRule.findOneAndUpdate(
          { guildId: ctx.guild.id, name },
          {
            $set: {
              event: ctx.get("evento"),
              conditionType: ctx.get("condicion"),
              conditionValue: String(ctx.get("valor_condicion") ?? "").slice(0, 200),
              actionType,
              actionValue,
              enabled: true,
            },
          },
          { upsert: true, returnDocument: "after" }
        );
        invalidateAutoRulesCache(ctx.guild.id);

        await ctx.send(ComponentsV2Builder.card({
          title: "Regla de automatización guardada",
          description: `Regla \`${name}\` activa para evento \`${ctx.get("evento")}\`.`,
          color: GREEN,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "ruleremove", description: "Elimina una regla lógica de automatización" }),
      params: new ParamsBuilder().addString({ name: "nombre", description: "Nombre de la regla", required: true }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const name = String(ctx.get("nombre") ?? "").trim().toLowerCase();
        const res = await AutoRule.deleteOne({ guildId: ctx.guild.id, name });
        if (!res.deletedCount) return ctx.ephemeral("No encontré esa regla");
        invalidateAutoRulesCache(ctx.guild.id);
        await ctx.send(ComponentsV2Builder.card({ title: "Regla eliminada", description: `Se eliminó \`${name}\`.`, color: RED }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "rulelist", description: "Lista las reglas lógicas de automatización del servidor" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const list = await AutoRule.find({ guildId: ctx.guild.id }).lean();
        if (!list.length) return ctx.ephemeral("No hay reglas configuradas");
        const rows = list.map((r) => `• \`${r.name}\`: **${r.event}** (${r.conditionType}) → \`${r.actionType}\``);
        const paginator = createStandardListPaginator({
          items: rows,
          ownerId: ctx.user?.id,
          perPage: 12,
          title: `Reglas (${list.length}/${MAX_RULES})`,
        });
        await paginator.send(ctx);
      },
    }),
};

module.exports = { data };
