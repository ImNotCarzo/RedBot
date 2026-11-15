import { Client, ClientOptions, CommandInteraction, Message, Snowflake } from "discord.js";
import { Context } from "./Context.js";
import { CommandLocalizer, Loader, Plugin } from "./Loader.js";
import { HelpCommand, HelpCommandOptions } from "./HelpCommand.js";
import { Cooldowns } from "./Cooldowns.js";

export interface GraloniumRestrictions {
  userIDs: Set<Snowflake>;
  guildIDs: Set<Snowflake>;
}

type MaybePromise<T> = T | Promise<T>;

export interface GraloniumOptions extends ClientOptions {
  autoSync?: boolean;
  context?: typeof Context;
  guildOnly?: boolean;
  owners?: Snowflake[];
  prefix: string | string[] | ((ctx: Context) => MaybePromise<string | string[]>);
  replyOnEdit?: boolean;
  replyOnPrefix?: boolean;
  helpCommand?: typeof HelpCommand;
  helpCommandOptions?: HelpCommandOptions;
  restrictions?: GraloniumRestrictions;
  debug?: boolean;
  bindProcessHandlers?: boolean;
  retryOnRateLimit?: boolean;
  defaultLocale?: string;
  localizeCommand?: CommandLocalizer;
  beforeExecute?: (ctx: Context, command: any, options: any) => boolean | void | Promise<boolean | void>;
  afterExecute?: (ctx: Context, command: any, options: any) => void | Promise<void>;
}

export declare class Gralonium extends Client {
  cooldowns: Cooldowns;
  loader: Loader;
  ops: GraloniumOptions;
  constructor(options: GraloniumOptions);
  addGlobalPlugins(plugins: Plugin[]): this;
  getContext(data: CommandInteraction | Message): Context;
  load(dir: string, reload?: boolean): Promise<import("./Loader.js").ModuleData<import("./builders/InteractionBuilder.js").InteractionBuilder | import("./builders/CommandBuilder.js").CommandBuilder | import("./builders/EventBuilder.js").EventBuilder | import("./builders/GroupBuilder.js").GroupBuilder, any[]>[]>;
  sync(guildIDs?: string[]): Promise<Record<string, any>[]>;
  handleFrameworkError(error: unknown, ctx?: Context | null): void;
  login(token: string): Promise<string>;
  destroy(): this;
}
