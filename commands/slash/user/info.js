const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, MessageFlags } = require("discord.js");
const { createCommandLogger, clampPage } = require("../../_shared/runtime");
const {
  resolveUser,
  resolveMember,
  buildRolesEmbed,
  buildPermsEmbed,
  buildPaginationRow,
  makeSelectRow,
  uniqueId,
  formatPermName,
  paginateArray,
  createCollectorManager,
  buildExtendedFields,
} = require("./_helpers");

const log = createCommandLogger("CMD_USER");

module.exports = {
  command: {
    data: new CommandBuilder({ name: "info", description: "Muestra información general de un usuario" }),
    params: new ParamsBuilder().addMember({ name: "usuario", description: "Menciona a alguien", required: false }),

    async code(ctx) {
      try {
        const input = ctx.get("usuario") ?? null;
        const invoker = ctx.user ?? ctx.author ?? ctx.member?.user;
        const guild = ctx.guild;

        // ── Sin servidor (DM) ──────────────────────────────
        if (!guild) {
          const user = await resolveUser(ctx, input);
          if (!user) return ctx.send("No se encontró ningún usuario");
          const fetched = await user.fetch().catch(() => user);
          const createdTs = Math.floor(fetched.createdTimestamp / 1000);
          const insignias = fetched.flags?.toArray().map((f) => `\`${f}\``).join(", ") || "Sin insignias";

          const embed = new EmbedBuilder()
            .setThumbnail(fetched.displayAvatarURL({ size: 1024 }))
            .setColor("#ff383d")
            .setTitle(`${fetched.id}`)
            .addFields({
              name: "General",
              value:
                `> **ID:** \`${fetched.id}\`\n` +
                `> **Insignias:** ${insignias}\n` +
                `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
            })
            .setTimestamp();

          const hasBanner = !!fetched.banner;
          const baseOptions = [
            { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
            ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
          ];
          const selectId = uniqueId("user_info_dm");

          const reply = await ctx.send({
            embeds: [embed],
            components: [makeSelectRow(selectId, false, baseOptions)],
          });

          const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 5 * 60_000,
            filter: (i) => i.customId === selectId,
          });

          collector.on("collect", async (interaction) => {
            const selected = interaction.values[0];
            const isAuthor = interaction.user.id === invoker.id;

            if (selected === "info") {
              if (!isAuthor) return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [embed], components: [makeSelectRow(selectId, false, baseOptions)] });
            }
            if (selected === "avatar") {
              const url = fetched.displayAvatarURL({ size: 4096, extension: "png" });
              const av = new EmbedBuilder()
                .setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) })
                .setTitle("Avatar").setURL(url).setImage(url).setColor("#ff383d").setTimestamp();
              if (!isAuthor) return interaction.reply({ embeds: [av], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [av], components: [makeSelectRow(selectId, true, baseOptions)] });
            }
            if (selected === "banner") {
              const bannerURL = fetched.bannerURL({ size: 4096 });
              if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
              const bn = new EmbedBuilder()
                .setAuthor({ name: fetched.username, iconURL: fetched.displayAvatarURL({ size: 128 }) })
                .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor("#ff383d").setTimestamp();
              if (!isAuthor) return interaction.reply({ embeds: [bn], flags: MessageFlags.Ephemeral });
              return interaction.update({ embeds: [bn], components: [makeSelectRow(selectId, true, baseOptions)] });
            }
          });

          collector.on("end", async () => reply.edit({ components: [] }).catch(() => {}));
          return;
        }

        // ── Con servidor ───────────────────────────────────
        const member = await resolveMember(ctx, input);
        if (!member) return ctx.send("No se encontró ningún usuario");

        const user = await member.user.fetch().catch(() => member.user);
        const insignias = user.flags?.toArray().map((f) => `\`${f}\``).join(", ") || "Sin insignias";
        const colorRol = member.displayHexColor || "#2b2d31";
        const createdTs = Math.floor(user.createdTimestamp / 1000);
        const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
        const hasBanner = !!user.banner;

        const fields = [
          {
            name: "General",
            value:
              `> **ID:** \`${user.id}\`\n` +
              `> **Color del rol:** \`${colorRol}\`\n` +
              `> **Insignias:** ${insignias}\n` +
              `> **Cuenta creada:** <t:${createdTs}:F> (<t:${createdTs}:R>)`,
          },
          {
            name: "Servidor",
            value:
              `> **Apodo:** ${member.nickname ?? "Sin apodo"}\n` +
              `> **Ingreso:** ${joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "No disponible"}`,
          },
          ...buildExtendedFields(member, user),
        ];

        const infoEmbed = new EmbedBuilder()
          .setThumbnail(user.displayAvatarURL({ size: 1024 }))
          .setColor(colorRol)
          .setTitle(`${user.username}`)
          .addFields(fields)
          .setTimestamp();

        const baseOptions = [
          { label: "Avatar", value: "avatar", description: "Avatar del usuario" },
          ...(hasBanner ? [{ label: "Banner", value: "banner", description: "Banner del usuario" }] : []),
          { label: "Roles", value: "roles", description: "Roles del usuario" },
          { label: "Permisos", value: "permissions", description: "Permisos del usuario" },
        ];
        const selectId = uniqueId("user_info_select");
        const authorId = invoker.id;
        const cm = createCollectorManager();

        const reply = await ctx.send({
          embeds: [infoEmbed],
          components: [makeSelectRow(selectId, false, baseOptions)],
        });

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 5 * 60_000,
          filter: (i) => i.customId === selectId,
        });

        collector.on("collect", async (interaction) => {
          const isAuthor = interaction.user.id === authorId;
          const selected = interaction.values[0];

          cm.stopAll();

          // ── Respuesta efímera para no-autores ──
          if (!isAuthor) {
            if (selected === "avatar") {
              const url = member.displayAvatarURL({ extension: "png", size: 4096 });
              const av = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setTitle("Avatar").setURL(url).setImage(url).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [av], flags: MessageFlags.Ephemeral });
            }
            if (selected === "banner") {
              const bannerURL = user.bannerURL({ size: 4096 });
              if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
              const bn = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [bn], flags: MessageFlags.Ephemeral });
            }
            if (selected === "roles") {
              const roles = member.roles.cache
                .filter((r) => r.id !== guild.id)
                .sort((a, b) => b.position - a.position)
                .map((r, i) => `${i + 1}. <@&${r.id}>`);
              if (!roles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });
              const embed = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setDescription(roles.join("\n")).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            if (selected === "permissions") {
              const perms = member.permissions.toArray().sort().map(formatPermName);
              if (!perms.length) return interaction.reply({ content: "Sin permisos", flags: MessageFlags.Ephemeral });
              const embed = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setDescription(perms.join("\n")).setColor(colorRol).setTimestamp();
              return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ content: "No es tu comando", flags: MessageFlags.Ephemeral });
          }

          // ── Respuestas del autor ──
          if (selected === "info") {
            return interaction.update({ embeds: [infoEmbed], components: [makeSelectRow(selectId, false, baseOptions)] });
          }

          if (selected === "avatar") {
            const avatarOpts = { extension: "png", size: 4096 };
            const serverAvatar = member.displayAvatarURL(avatarOpts);
            const globalAvatar = user.displayAvatarURL(avatarOpts);
            const hasDistinct = !!(member.avatar && member.avatar !== user.avatar);

            const buildAv = (type) => new EmbedBuilder()
              .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
              .setTitle(type === "server" ? "Avatar del servidor" : "Avatar global")
              .setURL(type === "server" ? serverAvatar : globalAvatar)
              .setImage(type === "server" ? serverAvatar : globalAvatar)
              .setColor(colorRol).setTimestamp();

            if (hasDistinct) {
              const avSelectId = uniqueId("user_av");
              const avRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(avSelectId).setPlaceholder("Tipo de avatar...")
                  .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel("Avatar del Servidor").setValue("server").setDescription("Avatar de servidor"),
                    new StringSelectMenuOptionBuilder().setLabel("Avatar Global").setValue("global").setDescription("Avatar global")
                  )
              );
              await interaction.update({ embeds: [buildAv("server")], components: [makeSelectRow(selectId, true, baseOptions), avRow] });

              const avCollector = reply.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60_000,
                filter: (i) => i.customId === avSelectId && i.user.id === authorId,
              });
              cm.set("avatar", avCollector);
              avCollector.on("collect", async (i) => {
                await i.update({ embeds: [buildAv(i.values[0])], components: [makeSelectRow(selectId, true, baseOptions), avRow] });
              });
            } else {
              await interaction.update({ embeds: [buildAv("server")], components: [makeSelectRow(selectId, true, baseOptions)] });
            }
            return;
          }

          if (selected === "banner") {
            const bannerURL = user.bannerURL({ size: 4096 });
            if (!bannerURL) return interaction.reply({ content: "Este usuario no tiene banner", flags: MessageFlags.Ephemeral });
            return interaction.update({
              embeds: [new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 128 }) })
                .setTitle("Banner").setURL(bannerURL).setImage(bannerURL).setColor(colorRol).setTimestamp()],
              components: [makeSelectRow(selectId, true, baseOptions)],
            });
          }

          if (selected === "roles") {
            const allRoles = member.roles.cache
              .filter((r) => r.id !== guild.id)
              .sort((a, b) => b.position - a.position)
              .map((r) => `<@&${r.id}>`);
            if (!allRoles.length) return interaction.reply({ content: "Este usuario no tiene roles", flags: MessageFlags.Ephemeral });

            const pages = paginateArray(allRoles);
            let page = 0;
            const prevId = uniqueId("roles_prev");
            const nextId = uniqueId("roles_next");

            await interaction.update({
              embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
              components: pages.length > 1
                ? [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)]
                : [makeSelectRow(selectId, true, baseOptions)],
            });
            if (pages.length <= 1) return;

            const rCollector = reply.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 2 * 60_000,
              filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
            });
            cm.set("roles", rCollector);
            rCollector.on("collect", async (i) => {
              page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
              await i.update({
                embeds: [buildRolesEmbed(member, user, user.username, pages[page], page, pages.length)],
                components: [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)],
              });
            });
            rCollector.on("end", async () => reply.edit({ components: [makeSelectRow(selectId, true, baseOptions)] }).catch(() => {}));
            return;
          }

          if (selected === "permissions") {
            const perms = member.permissions.toArray().sort().map(formatPermName);
            if (!perms.length) return interaction.reply({ content: "Este usuario no tiene permisos", flags: MessageFlags.Ephemeral });

            const pages = paginateArray(perms);
            let page = 0;
            const prevId = uniqueId("perms_prev");
            const nextId = uniqueId("perms_next");

            await interaction.update({
              embeds: [buildPermsEmbed(user, pages[page], page, pages.length, colorRol)],
              components: pages.length > 1
                ? [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)]
                : [makeSelectRow(selectId, true, baseOptions)],
            });
            if (pages.length <= 1) return;

            const pCollector = reply.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 2 * 60_000,
              filter: (i) => [prevId, nextId].includes(i.customId) && i.user.id === authorId,
            });
            cm.set("permissions", pCollector);
            pCollector.on("collect", async (i) => {
              page = clampPage(i.customId === prevId ? page - 1 : page + 1, pages.length);
              await i.update({
                embeds: [buildPermsEmbed(user, pages[page], page, pages.length, colorRol)],
                components: [makeSelectRow(selectId, true, baseOptions), buildPaginationRow(prevId, nextId, page, pages.length)],
              });
            });
            pCollector.on("end", async () => reply.edit({ components: [makeSelectRow(selectId, true, baseOptions)] }).catch(() => {}));
          }
        });

        collector.on("end", async () => {
          cm.stopAll();
          await reply.edit({ components: [] }).catch(() => {});
        });

      } catch (err) {
        log.error("Error en user info", { err: err?.message ?? String(err) });
        await ctx.send("No se pudo obtener la información del usuario");
      }
    },
  },
};
