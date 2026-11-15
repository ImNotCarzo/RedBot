import type { ApplicationIntegrationType, InteractionContextType } from "discord.js";
import type { LocalizationMap } from "./CommandBuilder.js";
import { Command, Types } from "../Loader.js";

type GroupBuilderOptions = {
  name: string;
  aliases?: string[];
  description?: string;
  as_slash?: boolean;
  as_prefix?: boolean;
  guildOnly?: boolean;
  defaultMemberPermissions?: string | bigint;
  userPermissions?: string[];
  botPermissions?: string[];
  guards?: Array<(ctx: any) => boolean | Promise<boolean>>;
  integrationTypes?: Array<ApplicationIntegrationType | number>;
  contexts?: Array<InteractionContextType | number>;
  nameLocalizations?: LocalizationMap;
  name_localizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
  description_localizations?: LocalizationMap;
};

export declare class GroupBuilder {
  name: string;
  aliases: string[];
  description: string;
  commands: Command<Types.Normal>[];
  as_slash: boolean;
  as_prefix: boolean;
  guildOnly: boolean | undefined;
  defaultMemberPermissions?: string | bigint | undefined;
  userPermissions: string[];
  botPermissions: string[];
  guards: Array<(ctx: any) => boolean | Promise<boolean>>;
  integrationTypes?: Array<ApplicationIntegrationType | number>;
  contexts?: Array<InteractionContextType | number>;
  nameLocalizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
  constructor(ops?: GroupBuilderOptions);
  setName(name: string): GroupBuilder;
  setDescription(description: string): GroupBuilder;
  addCommand(command: Command<Types.Normal>): GroupBuilder;
  setGuards(...guards: Array<(ctx: any) => boolean | Promise<boolean>>): GroupBuilder;
  setUserPermissions(...permissions: string[]): GroupBuilder;
  setBotPermissions(...permissions: string[]): GroupBuilder;
  allowPrefix(allow: boolean): GroupBuilder;
  allowSlash(allow: boolean): GroupBuilder;
  setIntegrationTypes(...types: Array<ApplicationIntegrationType | number | Array<ApplicationIntegrationType | number>>): GroupBuilder;
  setContexts(...contexts: Array<InteractionContextType | number | Array<InteractionContextType | number>>): GroupBuilder;
  setNameLocalizations(locales?: LocalizationMap | null): GroupBuilder;
  setDescriptionLocalizations(locales?: LocalizationMap | null): GroupBuilder;
  toJSON(): {
    name: string;
    description: string;
    options: any[];
    default_member_permissions: string | null | undefined;
    dm_permission: boolean | undefined;
    name_localizations?: LocalizationMap;
    description_localizations?: LocalizationMap;
    integration_types?: Array<ApplicationIntegrationType | number>;
    contexts?: Array<InteractionContextType | number>;
  };
}

export {};
