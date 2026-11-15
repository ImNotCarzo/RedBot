import type { ApplicationIntegrationType, InteractionContextType } from "discord.js";

export type LocalizationMap = Record<string, string>;

export declare function validateDefaultMemberPermissions(permissions: unknown): string | null | undefined;
export declare function normalizeNameLocalizations(map?: LocalizationMap | null): LocalizationMap | undefined;
export declare function normalizeDescriptionLocalizations(map?: LocalizationMap | null): LocalizationMap | undefined;

export interface CommandDataBuilder {
  name: string;
  aliases?: string[];
  description?: string;
  as_prefix?: boolean;
  as_slash?: boolean;
  fallback?: true;
  guildOnly?: boolean;
  multiple_args?: boolean;
  defaultMemberPermissions?: string | bigint;
  userPermissions?: string[];
  botPermissions?: string[];
  guards?: Array<(ctx: any) => boolean | Promise<boolean>>;
  cooldown?: { seconds: number; bucket?: string };
  integrationTypes?: Array<ApplicationIntegrationType | number>;
  contexts?: Array<InteractionContextType | number>;
  nameLocalizations?: LocalizationMap;
  name_localizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
  description_localizations?: LocalizationMap;
}

export declare class CommandBuilder {
  name: string;
  aliases: string[];
  description: string;
  as_prefix: boolean;
  as_slash: boolean;
  fallback: boolean;
  guildOnly: boolean | undefined;
  multiple_args?: boolean;
  defaultMemberPermissions?: string | bigint | undefined;
  userPermissions: string[];
  botPermissions: string[];
  guards: Array<(ctx: any) => boolean | Promise<boolean>>;
  cooldown?: { seconds: number; bucket?: string };
  integrationTypes?: Array<ApplicationIntegrationType | number>;
  contexts?: Array<InteractionContextType | number>;
  nameLocalizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
  constructor(options?: CommandDataBuilder);
  setName(name: string): CommandBuilder;
  setDescription(description: string): CommandBuilder;
  setAliases(...aliases: string[]): CommandBuilder;
  allowPrefix(allow: boolean): CommandBuilder;
  allowSlash(allow: boolean): CommandBuilder;
  allowMultipleArgs(allow: boolean): CommandBuilder;
  setGuards(...guards: Array<(ctx: any) => boolean | Promise<boolean>>): CommandBuilder;
  setUserPermissions(...permissions: string[]): CommandBuilder;
  setBotPermissions(...permissions: string[]): CommandBuilder;
  setCooldown(seconds: number, bucket?: string): CommandBuilder;
  setIntegrationTypes(...types: Array<ApplicationIntegrationType | number | Array<ApplicationIntegrationType | number>>): CommandBuilder;
  setContexts(...contexts: Array<InteractionContextType | number | Array<InteractionContextType | number>>): CommandBuilder;
  setNameLocalizations(locales?: LocalizationMap | null): CommandBuilder;
  setDescriptionLocalizations(locales?: LocalizationMap | null): CommandBuilder;
  toJSON(): {
    name: string;
    description: string;
    default_member_permissions: string | null | undefined;
    dm_permission: boolean | undefined;
    name_localizations?: LocalizationMap;
    description_localizations?: LocalizationMap;
    integration_types?: Array<ApplicationIntegrationType | number>;
    contexts?: Array<InteractionContextType | number>;
  };
}
