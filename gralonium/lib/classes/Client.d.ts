import { Client, ClientOptions, CommandInteraction, Message, Snowflake } from "discord.js";
import { Context } from "./Context.js";
import { Loader, Plugin } from "./Loader.js";
import { HelpCommand } from "./HelpCommand.js";
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
  helpCommand?: typeof HelpCommand;
  restrictions?: GraloniumRestrictions;
  debug?: boolean;
  bindProcessHandlers?: boolean;
  retryOnRateLimit?: boolean;
}

export declare class Gralonium extends Client {
  cooldowns: Cooldowns;
  loader: Loader;
  ops: GraloniumOptions;
  constructor(options: GraloniumOptions);
  addGlobalPlugins(plugins: Plugin[]): this;
  getContext(data: CommandInteraction | Message): Context;
  load(dir: string, reload?: boolean): Promise<import("./Loader.js").ModuleData<import("./builders/InteractionBuilder.js").InteractionBuilder | import("./builders/CommandBuilder.js").CommandBuilder | import("./builders/EventBuilder.js").EventBuilder | import("./builders/GroupBuilder.js").GroupBuilder, any[]>[]>;
  sync(guildIDs?: string[]): Promise<void>;
  handleFrameworkError(error: unknown, ctx?: Context | null): void;
  login(token: string): Promise<string>;
  destroy(): this;
}
