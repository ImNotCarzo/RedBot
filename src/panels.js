const {
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { ComponentsV2Builder, V2Text, V2View } = require("gralonium");
const { JoinRole, Log } = require("./database");
const { GREEN, RED } = require("./config");
const { getPrefix, setPrefix, setLogChannel, clearLogChannel, logAction } = require("./guild");

function buildSetupCard({ guild, prefix, logChannelId, joinRoleDoc, view, isEnded, hasCustomBot = false }) {
  const joinValue = joinRoleDoc?.roleId
    ? `<@&${joinRoleDoc.roleId}>${joinRoleDoc.ignoreBots ? " (ignora bots)" : ""}`
    : "Desactivado";

  const builder = new ComponentsV2Builder({ color: RED })
    .addSection(
      [
        V2Text.heading("Configuración del servidor", 3, 200),
        V2Text.subtext(guild.name, 120),
      ],
      { thumbnail: guild.iconURL({ size: 256 }), fallbackToText: true }
    )
    .addSeparator("small")
    .addFields([
      ["Prefijo", V2Text.code(prefix)],
      ["Canal de logs", logChannelId ? `<#${logChannelId}>` : "Desactivado"],
      ["Rol automático", joinValue],
    ]);

  if (!isEnded && view) {
    builder
      .addSpacer("small")
      .addChannelSelectMenu({
        customId: view.id("logs"),
        placeholder: "Seleccionar canal de logs...",
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        ...(logChannelId ? { defaultChannels: [logChannelId] } : {}),
      })
      .addSpacer("small")
      .addRoleSelectMenu({
        customId: view.id("joinrole"),
        placeholder: "Seleccionar rol automático al entrar...",
        ...(joinRoleDoc?.roleId ? { defaultRoles: [joinRoleDoc.roleId] } : {}),
      })
      .addSpacer("small")
      .addButtonsRow([
        { customId: view.id("prefix"), label: "Prefijo", style: "primary" },
        {
          customId: view.id("togglebots"),
          label: joinRoleDoc?.ignoreBots ? "Autorole: Ignora bots" : "Autorole: Incluye bots",
          style: "secondary",
          disabled: !joinRoleDoc?.roleId,
        },
        {
          customId: view.id("clearlogs"),
          label: "Quitar logs",
          style: "danger",
          disabled: !logChannelId,
        },
        {
          customId: view.id("clearjoin"),
          label: "Quitar autorole",
          style: "danger",
          disabled: !joinRoleDoc?.roleId,
        },
        ...(hasCustomBot ? [{ customId: view.id("custombot"), label: "Perfil del bot", style: "secondary" }] : []),
      ]);
  }

  return builder;
}

function buildPrefixModal(customId, currentPrefix) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Cambiar prefijo")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Nuevo prefijo (1 a 3 caracteres)")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("prefix")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true)
            .setValue(currentPrefix)
        )
    );
}

async function sendServerSetupPanel(ctx, { onOpenCustomBot = null } = {}) {
  const guild = ctx.guild;
  const author = ctx.user;

  const [prefix, logDoc, joinRoleDoc] = await Promise.all([
    getPrefix(guild.id),
    Log.findOne({ guildId: guild.id }).lean(),
    JoinRole.findOne({ guildId: guild.id }).lean(),
  ]);

  const view = new V2View({
    authorId: author.id,
    timeout: 3 * 60_000,
    thirdPartyMode: "reject",
    thirdPartyMessage: "No puedes usar este menú",
    onEnd: "static",
    state: {
      prefix,
      logChannelId: logDoc?.channelId ?? null,
      joinRoleDoc: joinRoleDoc ? { roleId: joinRoleDoc.roleId, ignoreBots: Boolean(joinRoleDoc.ignoreBots) } : null,
    },
    render: ({ state, view: activeView, isEnded }) =>
      buildSetupCard({
        guild,
        prefix: state.prefix,
        logChannelId: state.logChannelId,
        joinRoleDoc: state.joinRoleDoc,
        view: activeView,
        isEnded,
        hasCustomBot: typeof onOpenCustomBot === "function",
      }),
    renderStatic: ({ state }) =>
      buildSetupCard({ guild, prefix: state.prefix, logChannelId: state.logChannelId, joinRoleDoc: state.joinRoleDoc, isEnded: true }),
    actions: {
      logs: async ({ values, interaction, setState }) => {
        const channelId = values[0];
        if (!channelId) return false;
        const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
        if (!channel?.isTextBased?.()) {
          await interaction.reply({ content: "El canal debe ser de texto", flags: MessageFlags.Ephemeral }).catch(() => {});
          return false;
        }
        await setLogChannel(guild.id, channelId);
        setState({ logChannelId: channelId });
      },
      clearlogs: async ({ setState }) => {
        await clearLogChannel(guild.id);
        setState({ logChannelId: null });
      },
      joinrole: async ({ values, interaction, state, setState }) => {
        const roleId = values[0];
        if (!roleId) return false;
        const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
        if (!role || role.id === guild.id) {
          await interaction.reply({ content: "No puedes seleccionar `@everyone`", flags: MessageFlags.Ephemeral }).catch(() => {});
          return false;
        }
        const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
        if (role.managed) {
          await interaction.reply({ content: "Ese rol es gestionado por una integración y no se puede asignar", flags: MessageFlags.Ephemeral }).catch(() => {});
          return false;
        }
        if (me && role.position >= me.roles.highest.position) {
          await interaction.reply({ content: "Ese rol es igual o superior a mi rol más alto", flags: MessageFlags.Ephemeral }).catch(() => {});
          return false;
        }
        const ignoreBots = Boolean(state.joinRoleDoc?.ignoreBots);
        await JoinRole.findOneAndUpdate(
          { guildId: guild.id },
          { roleId: role.id, ignoreBots },
          { upsert: true }
        );
        await logAction(guild, {
          title: "Rol join configurado",
          color: GREEN,
          fields: [
            { name: "Rol", value: `${role.name} (\`${role.id}\`)`, inline: true },
            { name: "Moderador", value: author.tag, inline: true },
            { name: "Ignorar bots", value: ignoreBots ? "Sí" : "No", inline: true },
          ],
        });
        setState({ joinRoleDoc: { roleId: role.id, ignoreBots } });
      },
      togglebots: async ({ state, setState }) => {
        if (!state.joinRoleDoc?.roleId) return false;
        const nextIgnore = !state.joinRoleDoc.ignoreBots;
        await JoinRole.findOneAndUpdate(
          { guildId: guild.id },
          { ignoreBots: nextIgnore },
          { upsert: true }
        );
        setState({ joinRoleDoc: { ...state.joinRoleDoc, ignoreBots: nextIgnore } });
      },
      clearjoin: async ({ setState }) => {
        await JoinRole.findOneAndDelete({ guildId: guild.id });
        await logAction(guild, { description: "Rol automático al entrar desactivado", color: RED });
        setState({ joinRoleDoc: null });
      },
      prefix: async ({ interaction, state, view: activeView }) => {
        const modalId = activeView.id("prefixmodal", Date.now().toString(36));
        await interaction.showModal(buildPrefixModal(modalId, state.prefix));

        const submitted = await interaction
          .awaitModalSubmit({
            time: 2 * 60_000,
            filter: (i) => i.customId === modalId && i.user.id === author.id,
          })
          .catch(() => null);
        if (!submitted) return false;

        const nuevo = submitted.fields.getTextInputValue("prefix")?.trim();
        if (!nuevo || nuevo.length > 3) {
          await submitted.reply({ content: "El prefix no puede tener más de 3 caracteres", flags: MessageFlags.Ephemeral }).catch(() => {});
          return false;
        }

        await setPrefix(guild.id, nuevo);
        await submitted.deferUpdate().catch(() => {});
        activeView.setState({ prefix: nuevo });
        const nextPayload = activeView.toPayload();
        if (activeView.message?.editable) {
          await activeView.message.edit(nextPayload).catch(() => {});
        }
        return false;
      },
      custombot: async ({ interaction, view: activeView }) => {
        if (typeof onOpenCustomBot !== "function") return false;
        activeView.stop("switched");
        await interaction.deferUpdate().catch(() => {});
        await onOpenCustomBot({
          ...ctx,
          message: null,
          send: (payload) => interaction.followUp(typeof payload?.toPayload === "function" ? payload.toPayload() : payload),
        });
        return false;
      },
    },
  });

  await view.send(ctx);
}

module.exports = {
  buildSetupCard,
  sendServerSetupPanel,
};
