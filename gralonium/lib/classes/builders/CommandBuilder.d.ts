export declare function validateDefaultMemberPermissions(permissions: unknown): string | null | undefined;

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
  toJSON(): {
    name: string;
    description: string;
    default_member_permissions: string | null | undefined;
    dm_permission: boolean | undefined;
  };
}
