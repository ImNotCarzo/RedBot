const { ApplicationCommandType, ApplicationIntegrationType, ContextMenuCommandBuilder, InteractionContextType, PermissionFlagsBits } = require("discord.js");
const { InteractionBuilder, Interactions } = require("gralonium");
const {
  handleTranslateContext,
  handleOcrContext,
  handleResumeContext,
  handleRemindContext,
  handleModDossierContext,
} = require("../../src/contextMenus");

const USER_AND_GUILD_CONTEXTS = [
  InteractionContextType.Guild,
  InteractionContextType.BotDM,
  InteractionContextType.PrivateChannel,
];
const USER_AND_GUILD_INTEGRATIONS = [
  ApplicationIntegrationType.GuildInstall,
  ApplicationIntegrationType.UserInstall,
];

const CONTEXT_MENU_SPECS = [
  {
    name: "Traducir",
    type: ApplicationCommandType.Message,
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (_bot, interaction) => handleTranslateContext(interaction),
  },
  {
    name: "Extraer texto (OCR)",
    type: ApplicationCommandType.Message,
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (_bot, interaction) => handleOcrContext(interaction),
  },
  {
    name: "Resumir mensaje",
    type: ApplicationCommandType.Message,
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (_bot, interaction) => handleResumeContext(interaction),
  },
  {
    name: "Recordar después",
    type: ApplicationCommandType.Message,
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (bot, interaction) => handleRemindContext(bot, interaction),
  },
  {
    name: "Expediente Mod",
    type: ApplicationCommandType.User,
    interactionType: Interactions.UserContextMenu,
    integrationTypes: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    run: (_bot, interaction) => handleModDossierContext(interaction),
  },
];

function buildContextMenuPayloads() {
  return CONTEXT_MENU_SPECS.map((spec) => {
    const builder = new ContextMenuCommandBuilder()
      .setName(spec.name)
      .setType(spec.type)
      .setIntegrationTypes(...spec.integrationTypes)
      .setContexts(...spec.contexts);

    if (spec.defaultMemberPermissions !== undefined) {
      builder.setDefaultMemberPermissions(spec.defaultMemberPermissions);
    }
    return builder.toJSON();
  });
}

module.exports = {
  data: CONTEXT_MENU_SPECS.map((spec) => ({
    data: new InteractionBuilder({
      name: spec.name,
      type: spec.interactionType,
      description: `Menú contextual: ${spec.name}`,
    }),
    code: async (bot, interaction) => spec.run(bot, interaction),
  })),
  buildContextMenuPayloads,
};
