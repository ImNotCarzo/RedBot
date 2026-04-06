import { Command, Types } from "../classes/Loader.js";
import * as P from "./builders/ParamsBuilder.js";
import { Context } from "./Context.js";
import { Enire } from "./Client.js";
import * as DJS from "discord.js";

export declare class Utils {
  static isType<T, R>(obj: any, func: (obj: R) => boolean): obj is T;
  static noop(n?: null): null;
  static getMember(query: string, options: { guild: DJS.Guild; force: boolean }): Promise<DJS.GuildMember | null>;
  static getChannel<T = DJS.Channel>(query: string, options: { guild: DJS.Guild; force?: boolean }): Promise<T | null>;
  static getRole(query: string, options: { guild: DJS.Guild; force?: boolean }): Promise<DJS.Role | null>;
  static getUser(query: string, bot: Enire): Promise<DJS.User | null>;
  static transform(input: string, param: P.BaseParam, ctx: Context, seeable?: boolean): Promise<{ break: boolean; value: any }>;
  static executeCommand(
    ctx: Context,
    command: Command<Types.Normal>,
    options: { group?: Command<Types.Group> | null; source: "prefix" | "slash"; args?: string[] | null; interaction?: DJS.ChatInputCommandInteraction | null; prefix?: string }
  ): Promise<void>;
  static handleMessage(bot: Enire, message: DJS.Message, isEdit?: boolean): Promise<void>;
  static handleInteraction(bot: Enire, interaction: DJS.Interaction): Promise<void>;
  static runPrefixCommand(ctx: Context, command: Command<Types.Normal>, args: string[], group?: Command<Types.Group>): Promise<void>;
  static runInteractionCommand(ctx: Context, int: DJS.ChatInputCommandInteraction): Promise<void>;
  static splitArgs(text: string, special?: boolean, removeNewLines?: boolean): string[];
}
