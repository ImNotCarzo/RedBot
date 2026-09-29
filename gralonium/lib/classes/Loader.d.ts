import { InteractionBuilder } from "./builders/InteractionBuilder.js";
import { Collection, REST } from "discord.js";
import { CommandBuilder } from "./builders/CommandBuilder.js";
import { ParamsBuilder } from "./builders/ParamsBuilder.js";
import { EventBuilder } from "./builders/EventBuilder.js";
import { GroupBuilder } from "./builders/GroupBuilder.js";
import { Plugins as GraloniumPlugins } from "../main.js";
import { Context } from "./Context.js";
import { Gralonium } from "./Client.js";

export interface ModuleData<T extends unknown = unknown, K extends any[] = any[]> {
  data: CommandBuilder | GroupBuilder | InteractionBuilder | EventBuilder;
  plugins?: T extends CommandBuilder ? (typeof GraloniumPlugins[] | Plugin[]) : never;
  params?: T extends CommandBuilder ? ParamsBuilder : never;
  code?: T extends CommandBuilder
    ? (ctx: Context) => Promise<void>
    : T extends InteractionBuilder
    ? (interaction: any) => Promise<void>
    : T extends EventBuilder
    ? (bot: Gralonium, ...args: K) => Promise<void>
    : undefined;
}

export type AsyncFunction<S, T> = (args: S) => Promise<T>;
export type SyncFunction<S, T> = (args: S) => T;
export type Plugin = AsyncFunction<Context, boolean> | SyncFunction<Context, boolean> | Promise<(ctx: Context) => Promise<boolean>>;

export interface CommandStructures {
  normal: {
    data: CommandBuilder;
    params?: ParamsBuilder;
    plugins?: Plugin[];
    code: (ctx: Context) => Promise<void>;
  };
  group: {
    data: GroupBuilder;
  };
}

export declare enum Types {
  Normal = "normal",
  Group = "group"
}

export type Command<K extends keyof CommandStructures = "normal"> = CommandStructures[K];

interface GraloniumCollected {
  normal: Collection<string, Command<"normal">> | null;
  group: Collection<string, Command<"group">> | null;
}

interface LoaderOptions {
  client: Gralonium;
}

export interface CommandHelpingObject extends Command<Types.Normal> {
  group: Command<Types.Group> | null;
}

export interface GroupHelpingObject {
  data: GroupBuilder;
  subcommands: CommandHelpingObject[];
}

type InteractionTypes =
  | "autocomplete"
  | "button"
  | "chatInput"
  | "messageContextMenu"
  | "modalSubmit"
  | "userContextMenu"
  | "channelSelectMenu"
  | "roleSelectMenu"
  | "stringSelectMenu"
  | "userSelectMenu"
  | "mentionableSelectMenu"
  | "anyInteraction";

export declare class Loader {
  client: Gralonium;
  commands: GraloniumCollected;
  interactions: Record<InteractionTypes, Collection<string, ModuleData<InteractionBuilder>>>;
  globalPlugins: Plugin[];
  rest: REST;
  constructor(options: LoaderOptions);
  load(dir: string, reload?: boolean): Promise<ModuleData<InteractionBuilder | CommandBuilder | EventBuilder | GroupBuilder, any[]>[]>;
  walkCommands(callable?: (command: Command<Types>) => number): CommandHelpingObject[];
  sync(guildIDs?: string[]): Promise<void>;
}
