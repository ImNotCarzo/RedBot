const { GroupBuilder, CommandBuilder, ParamsBuilder, Plugins, ComponentsV2Builder, V2Text } = require("gralonium");
const { RED, GREEN } = require("../../src/config");
const { getMemberInviteStats, sendWelcomeOrGoodbye } = require("../../src/community");
const { Birthday, GuildConfig, InviteReward, InviteStat } = require("../../src/database");
const { avatarUrl, createListPaginator, noGuildReply } = require("../../src/runtime");

const ADMIN_PLUGINS = [Plugins.hasPerms("ManageGuild")];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const data = {
  data: new GroupBuilder({
    name: "community",
    description: "Bienvenidas, despedidas, cumpleaños e invitaciones",
    guildOnly: true,
    as_prefix: false,
    as_slash: true,
  })
    .addCommand({
      data: new CommandBuilder({ name: "welcome", description: "Configura o prueba el canal y mensaje de bienvenida" }),
      params: new ParamsBuilder()
        .addString({
          name: "estado",
          description: "Activar o desactivar",
          required: false,
          choices: [{ name: "Activar", value: "on" }, { name: "Desactivar", value: "off" }],
        })
        .addChannel({ name: "canal", description: "Canal de bienvenidas", required: false })
        .addString({ name: "mensaje", description: "Texto ({user}, {server}, {memberCount}, {inviter})", required: false })
        .addString({ name: "embed", description: "Plantilla embed de /auto embedadd (opcional)", required: false })
        .addString({ name: "dm", description: "Mensaje privado opcional al entrar", required: false })
        .addString({
          name: "probar",
          description: "Enviar una vista previa de prueba",
          required: false,
          choices: [{ name: "Sí", value: "true" }],
        }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const setObj = {};
        if (ctx.get("estado")) setObj["welcomeConfig.enabled"] = ctx.get("estado") === "on";
        const ch = ctx.get("canal");
        if (ch) {
          if (!ch.isTextBased?.()) return ctx.ephemeral("El canal debe ser de texto");
          setObj["welcomeConfig.channelId"] = ch.id;
          setObj["welcomeConfig.enabled"] = true;
        }
        if (ctx.get("mensaje")) setObj["welcomeConfig.message"] = ctx.get("mensaje").slice(0, 2000);
        if (ctx.get("embed")) setObj["welcomeConfig.templateName"] = ctx.get("embed").trim().toLowerCase();
        if (ctx.get("dm")) {
          setObj["welcomeConfig.dmEnabled"] = true;
          setObj["welcomeConfig.dmMessage"] = ctx.get("dm").slice(0, 2000);
        }

        const doc = Object.keys(setObj).length
          ? await GuildConfig.findOneAndUpdate({ guildId: ctx.guild.id }, { $set: setObj }, { upsert: true, returnDocument: "after" }).lean()
          : await GuildConfig.findOne({ guildId: ctx.guild.id }).select("welcomeConfig").lean();

        if (ctx.get("probar") === "true" && ctx.member) {
          await sendWelcomeOrGoodbye(ctx.member, "welcome", { inviterId: ctx.user.id, total: 1 });
        }

        const cfg = doc?.welcomeConfig ?? {};
        await ctx.send(ComponentsV2Builder.card({
          title: "Configuración de bienvenidas",
          fields: [
            ["Estado", V2Text.code(cfg.enabled ? "Activado" : "Desactivado")],
            ["Canal", cfg.channelId ? `<#${cfg.channelId}>` : V2Text.code("Sin configurar")],
            cfg.templateName ? ["Embed", V2Text.code(cfg.templateName)] : null,
            ["Mensaje", V2Text.clip(cfg.message || "-", 300)],
          ].filter(Boolean),
          color: cfg.enabled ? GREEN : RED,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "goodbye", description: "Configura o prueba el canal y embed de despedidas (separado de bienvenidas)" }),
      params: new ParamsBuilder()
        .addString({
          name: "estado",
          description: "Activar o desactivar",
          required: false,
          choices: [{ name: "Activar", value: "on" }, { name: "Desactivar", value: "off" }],
        })
        .addChannel({ name: "canal", description: "Canal dedicado para despedidas", required: false })
        .addString({ name: "mensaje", description: "Texto ({user.tag}, {server}, {memberCount})", required: false })
        .addString({ name: "embed", description: "Plantilla embed de /auto embedadd (opcional)", required: false })
        .addString({
          name: "probar",
          description: "Enviar una vista previa de prueba",
          required: false,
          choices: [{ name: "Sí", value: "true" }],
        }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const setObj = {};
        if (ctx.get("estado")) setObj["goodbyeConfig.enabled"] = ctx.get("estado") === "on";
        const ch = ctx.get("canal");
        if (ch) {
          if (!ch.isTextBased?.()) return ctx.ephemeral("El canal debe ser de texto");
          setObj["goodbyeConfig.channelId"] = ch.id;
          setObj["goodbyeConfig.enabled"] = true;
        }
        if (ctx.get("mensaje")) setObj["goodbyeConfig.message"] = ctx.get("mensaje").slice(0, 2000);
        if (ctx.get("embed")) setObj["goodbyeConfig.templateName"] = ctx.get("embed").trim().toLowerCase();

        const doc = Object.keys(setObj).length
          ? await GuildConfig.findOneAndUpdate({ guildId: ctx.guild.id }, { $set: setObj }, { upsert: true, returnDocument: "after" }).lean()
          : await GuildConfig.findOne({ guildId: ctx.guild.id }).select("goodbyeConfig").lean();

        if (ctx.get("probar") === "true" && ctx.member) {
          await sendWelcomeOrGoodbye(ctx.member, "goodbye");
        }

        const cfg = doc?.goodbyeConfig ?? {};
        await ctx.send(ComponentsV2Builder.card({
          title: "Configuración de despedidas",
          fields: [
            ["Estado", V2Text.code(cfg.enabled ? "Activado" : "Desactivado")],
            ["Canal", cfg.channelId ? `<#${cfg.channelId}>` : V2Text.code("Sin configurar")],
            cfg.templateName ? ["Embed", V2Text.code(cfg.templateName)] : null,
            ["Mensaje", V2Text.clip(cfg.message || "-", 300)],
          ].filter(Boolean),
          color: cfg.enabled ? GREEN : RED,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "birthday", description: "Registra o borra tu fecha de cumpleaños en el servidor" }),
      params: new ParamsBuilder()
        .addString({ name: "dia", description: "Día (1-31, omitir para borrar)", required: false })
        .addString({ name: "mes", description: "Mes (1-12)", required: false })
        .addString({ name: "anio", description: "Año de nacimiento (opcional)", required: false }),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const dayRaw = ctx.get("dia");
        const monthRaw = ctx.get("mes");
        if (!dayRaw && !monthRaw) {
          await Birthday.deleteOne({ guildId: ctx.guild.id, userId: ctx.user.id });
          return ctx.send(ComponentsV2Builder.card({ title: "Cumpleaños eliminado", description: "Se eliminó tu fecha guardada.", color: RED }));
        }
        const day = Number.parseInt(dayRaw, 10);
        const month = Number.parseInt(monthRaw, 10);
        const year = ctx.get("anio") ? Number.parseInt(ctx.get("anio"), 10) : null;
        if (!Number.isFinite(day) || day < 1 || day > 31 || !Number.isFinite(month) || month < 1 || month > 12) {
          return ctx.ephemeral("Fecha inválida. Indica día (1-31) y mes (1-12).");
        }
        await Birthday.findOneAndUpdate(
          { guildId: ctx.guild.id, userId: ctx.user.id },
          { $set: { day, month, year: year && year > 1920 && year < 2025 ? year : null } },
          { upsert: true, returnDocument: "after" }
        );
        await ctx.send(ComponentsV2Builder.card({
          title: "Cumpleaños guardado",
          description: `Tu cumpleaños quedó registrado el **${day} de ${MONTHS[month - 1]}**${year ? ` (${year})` : ""}.`,
          color: GREEN,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "birthdays", description: "Lista los cumpleaños registrados en el servidor" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const list = await Birthday.find({ guildId: ctx.guild.id }).sort({ month: 1, day: 1 }).lean();
        if (!list.length) return ctx.ephemeral("No hay cumpleaños registrados aún");
        const rows = list.map((b) => `• **${String(b.day).padStart(2, "0")} ${MONTHS[b.month - 1]}** — <@${b.userId}>`);
        const paginator = createListPaginator({
          items: rows,
          ownerId: ctx.user?.id,
          perPage: 12,
          render: ({ items, pageIndex, totalPages, controls }) => {
            const b = new ComponentsV2Builder({ color: RED })
              .addText(`${V2Text.heading("Cumpleaños del servidor", 3)}\n${V2Text.subtext(`Página ${pageIndex + 1}/${totalPages}`)}`)
              .addSeparator("small")
              .addText(items.join("\n"));
            if (controls) b.addSpacer("small").addButtonsRow(controls);
            return b;
          },
        });
        await paginator.send(ctx);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "birthdaysetup", description: "Configura el canal, rol temporal (24h) y mensaje de cumpleaños" }),
      params: new ParamsBuilder()
        .addChannel({ name: "canal", description: "Canal donde anunciar cumpleaños", required: false })
        .addRole({ name: "rol", description: "Rol temporal de cumpleañero (opcional)", required: false })
        .addString({ name: "mensaje", description: "Mensaje ({user}, {server}, {age})", required: false })
        .addString({
          name: "estado",
          description: "Activar o desactivar",
          required: false,
          choices: [{ name: "Activar", value: "on" }, { name: "Desactivar", value: "off" }],
        }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const setObj = {};
        if (ctx.get("estado")) setObj["birthdayConfig.enabled"] = ctx.get("estado") === "on";
        const ch = ctx.get("canal");
        if (ch) {
          if (!ch.isTextBased?.()) return ctx.ephemeral("El canal debe ser de texto");
          setObj["birthdayConfig.channelId"] = ch.id;
          setObj["birthdayConfig.enabled"] = true;
        }
        const role = ctx.get("rol");
        if (role) setObj["birthdayConfig.roleId"] = role.id;
        if (ctx.get("mensaje")) setObj["birthdayConfig.message"] = ctx.get("mensaje").slice(0, 1000);

        const doc = await GuildConfig.findOneAndUpdate(
          { guildId: ctx.guild.id },
          Object.keys(setObj).length ? { $set: setObj } : {},
          { upsert: true, returnDocument: "after" }
        ).lean();
        const cfg = doc?.birthdayConfig ?? {};
        await ctx.send(ComponentsV2Builder.card({
          title: "Configuración de cumpleaños",
          fields: [
            ["Estado", V2Text.code(cfg.enabled ? "Activado" : "Desactivado")],
            ["Canal", cfg.channelId ? `<#${cfg.channelId}>` : V2Text.code("Sin configurar")],
            ["Rol 24h", cfg.roleId ? `<@&${cfg.roleId}>` : V2Text.code("Ninguno")],
          ],
          color: cfg.enabled ? GREEN : RED,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "invites", description: "Consulta las invitaciones de un usuario" }),
      params: new ParamsBuilder().addMember({ name: "usuario", description: "Usuario a consultar (opcional)", required: false }),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const target = ctx.get("usuario") ?? ctx.member;
        const user = target?.user ?? ctx.user;
        const st = await getMemberInviteStats(ctx.guild.id, user.id);
        await ctx.send(ComponentsV2Builder.card({
          title: `Invitaciones de ${user.globalName ?? user.username}`,
          thumbnail: avatarUrl(user),
          fields: [
            ["Total válidas", V2Text.code(st.total)],
            ["Regulares", V2Text.code(st.regular)],
            ["Bonus", V2Text.code(st.bonus)],
            ["Salieron", V2Text.code(st.left)],
            ["Cuentas nuevas (fake)", V2Text.code(st.fake)],
          ],
          color: RED,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "inviteleaderboard", description: "Ranking de miembros con más invitaciones" }),
      params: new ParamsBuilder(),
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const list = await InviteStat.find({ guildId: ctx.guild.id }).lean();
        const ranked = list
          .map((s) => ({ userId: s.userId, total: (s.regular || 0) + (s.bonus || 0) - (s.left || 0) - (s.fake || 0), regular: s.regular || 0 }))
          .filter((x) => x.total > 0)
          .sort((a, b) => b.total - a.total);
        if (!ranked.length) return ctx.ephemeral("Aún no hay invitaciones registradas");

        const rows = ranked.map((r, i) => `**#${i + 1}** <@${r.userId}> — **${r.total}** invitaciones (${r.regular} regulares)`);
        const paginator = createListPaginator({
          items: rows,
          ownerId: ctx.user?.id,
          perPage: 10,
          render: ({ items, pageIndex, totalPages, controls }) => {
            const b = new ComponentsV2Builder({ color: RED })
              .addText(`${V2Text.heading("Ranking de invitaciones", 3)}\n${V2Text.subtext(`${ctx.guild.name} · Página ${pageIndex + 1}/${totalPages}`)}`)
              .addSeparator("small")
              .addText(items.join("\n"));
            if (controls) b.addSpacer("small").addButtonsRow(controls);
            return b;
          },
        });
        await paginator.send(ctx);
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "inviteadd", description: "Suma o resta invitaciones bonus a un usuario" }),
      params: new ParamsBuilder()
        .addMember({ name: "usuario", description: "Usuario objetivo", required: true })
        .addString({ name: "cantidad", description: "Cantidad (ej: 5 o -2)", required: true }),
      plugins: ADMIN_PLUGINS,
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const member = ctx.get("usuario");
        const delta = Number.parseInt(ctx.get("cantidad"), 10);
        if (!Number.isFinite(delta) || delta === 0) return ctx.ephemeral("Indica un número distinto de 0");
        await InviteStat.findOneAndUpdate(
          { guildId: ctx.guild.id, userId: member.id },
          { $inc: { bonus: delta } },
          { upsert: true, returnDocument: "after" }
        );
        await ctx.send(ComponentsV2Builder.card({
          title: "Invitaciones actualizadas",
          description: `Se ajustaron **${delta > 0 ? `+${delta}` : delta}** invitaciones bonus a ${member}.`,
          color: GREEN,
        }));
      },
    })
    .addCommand({
      data: new CommandBuilder({ name: "invitereward", description: "Configura o quita un rol de recompensa por invitaciones" }),
      params: new ParamsBuilder()
        .addString({ name: "invitaciones", description: "Cantidad de invitaciones requeridas", required: true })
        .addRole({ name: "rol", description: "Rol recompensa (omitir para eliminar)", required: false }),
      plugins: [...ADMIN_PLUGINS, Plugins.hasBotPerms("ManageRoles")],
      async code(ctx) {
        if (!ctx.guild) return noGuildReply(ctx);
        const reqInv = Number.parseInt(ctx.get("invitaciones"), 10);
        const role = ctx.get("rol");
        if (!Number.isFinite(reqInv) || reqInv < 1) return ctx.ephemeral("Indica un número >= 1");

        if (!role) {
          await InviteReward.deleteOne({ guildId: ctx.guild.id, invitesRequired: reqInv });
          return ctx.send(ComponentsV2Builder.card({ title: "Recompensa eliminada", description: `Se quitó la recompensa de ${reqInv} invitaciones.`, color: RED }));
        }
        await InviteReward.findOneAndUpdate(
          { guildId: ctx.guild.id, invitesRequired: reqInv },
          { $set: { roleId: role.id } },
          { upsert: true, returnDocument: "after" }
        );
        await ctx.send(ComponentsV2Builder.card({
          title: "Recompensa por invitaciones",
          description: `Al alcanzar **${reqInv}** invitaciones se otorgará ${role}.`,
          color: GREEN,
        }));
      },
    }),
};

module.exports = { data };
