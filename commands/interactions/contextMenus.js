const { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } = require("discord.js");
const { InteractionBuilder, Interactions } = require("gralonium");
const {
  handleTranslateContext,
  handleOcrContext,
  handleTranscribeContext,
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
    enName: "Translate",
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (_bot, interaction) => handleTranslateContext(interaction),
  },
  {
    name: "Extraer texto (OCR)",
    enName: "Extract text (OCR)",
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (_bot, interaction) => handleOcrContext(interaction),
  },
  {
    name: "Transcribir audio",
    enName: "Transcribe audio",
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (_bot, interaction) => handleTranscribeContext(interaction),
  },
  {
    name: "Resumir mensaje",
    enName: "Summarize message",
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (_bot, interaction) => handleResumeContext(interaction),
  },
  {
    name: "Recordar después",
    enName: "Remind me later",
    interactionType: Interactions.MessageContextMenu,
    integrationTypes: USER_AND_GUILD_INTEGRATIONS,
    contexts: USER_AND_GUILD_CONTEXTS,
    run: (bot, interaction) => handleRemindContext(bot, interaction),
  },
  {
    name: "Expediente Mod",
    enName: "Mod Dossier",
    interactionType: Interactions.UserContextMenu,
    integrationTypes: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    run: (_bot, interaction) => handleModDossierContext(interaction),
  },
];

const contextMenuModules = CONTEXT_MENU_SPECS.map((spec) => ({
  data: new InteractionBuilder({
    name: spec.name,
    type: spec.interactionType,
    integrationTypes: spec.integrationTypes,
    contexts: spec.contexts,
    ...(spec.defaultMemberPermissions !== undefined
      ? { defaultMemberPermissions: spec.defaultMemberPermissions }
      : {}),
    nameLocalizations: {
      "en-US": spec.enName,
      "en-GB": spec.enName,
    },
  }),
  code: async (bot, interaction) => spec.run(bot, interaction),
}));

module.exports = {
  data: contextMenuModules,
};
