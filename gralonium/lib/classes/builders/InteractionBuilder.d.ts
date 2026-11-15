import type { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import type { LocalizationMap } from "./CommandBuilder.js";

export declare enum Interactions {
  AnyInteraction = "anyInteraction",
  Autocomplete = "autocomplete",
  Button = "button",
  ChatInput = "chatInput",
  MessageContextMenu = "messageContextMenu",
  Modal = "modalSubmit",
  UserContextMenu = "userContextMenu",
  ChannelSelectMenu = "channelSelectMenu",
  RoleSelectMenu = "roleSelectMenu",
  StringSelectMenu = "stringSelectMenu",
  UserSelectMenu = "userSelectMenu",
  MentionableSelectMenu = "mentionableSelectMenu"
}

export type InteractionMatcher = RegExp | ((key: string, interaction: any) => boolean);

export interface InteractionDataBuilder {
  name?: string;
  type: Interactions;
  description?: string;
  prefix?: string;
  match?: InteractionMatcher;
  as_command?: boolean;
  guildOnly?: boolean;
  defaultMemberPermissions?: string | bigint;
  integrationTypes?: Array<ApplicationIntegrationType | number>;
  contexts?: Array<InteractionContextType | number>;
  nameLocalizations?: LocalizationMap;
  name_localizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
  description_localizations?: LocalizationMap;
}

export declare class InteractionBuilder {
  name?: string;
  type: Interactions;
  description: string;
  prefix?: string;
  match?: InteractionMatcher;
  as_command: boolean;
  guildOnly: boolean | undefined;
  defaultMemberPermissions?: string | bigint | undefined;
  integrationTypes?: Array<ApplicationIntegrationType | number>;
  contexts?: Array<InteractionContextType | number>;
  nameLocalizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
  constructor(options?: InteractionDataBuilder);
  setName(name: string): this;
  setDescription(description: string): this;
  setPrefix(prefix: string): this;
  setMatcher(matcher: InteractionMatcher): this;
  setNameLocalizations(locales?: LocalizationMap | null): this;
  setDescriptionLocalizations(locales?: LocalizationMap | null): this;
  setIntegrationTypes(...types: Array<ApplicationIntegrationType | number | Array<ApplicationIntegrationType | number>>): this;
  setContexts(...contexts: Array<InteractionContextType | number | Array<InteractionContextType | number>>): this;
  setDefaultMemberPermissions(permissions: string | bigint | undefined): this;
  setGuildOnly(guildOnly?: boolean): this;
  allowCommand(allow?: boolean): this;
  hasPattern(): boolean;
  matches(key: string, interaction?: any): boolean;
  /**
   * Returns the interaction data parsed as JSON.
   */
  toJSON(): {
    name: string | undefined;
    description: string;
    default_member_permissions?: string | null;
    dm_permission?: boolean;
    prefix?: string;
    name_localizations?: LocalizationMap;
    description_localizations?: LocalizationMap;
    integration_types?: Array<ApplicationIntegrationType | number>;
    contexts?: Array<InteractionContextType | number>;
  };
  /**
   * Returns the application command payload for context menu commands (`type: 2` / `type: 3`).
   */
  toCommandJSON(): {
    name: string | undefined;
    type: ApplicationCommandType;
    description?: string;
    default_member_permissions?: string | null;
    dm_permission?: boolean;
    name_localizations?: LocalizationMap;
    description_localizations?: LocalizationMap;
    integration_types?: Array<ApplicationIntegrationType | number>;
    contexts?: Array<InteractionContextType | number>;
  } | null;
}
