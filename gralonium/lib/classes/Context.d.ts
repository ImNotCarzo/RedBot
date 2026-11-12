import { Command, Types } from "../classes/Loader.js";
import * as P from "./builders/ParamsBuilder.js";
import type { ColorResolvable, ComponentsV2Builder, V2BuiltPayload } from "./builders/ComponentsV2Builder.js";
import { Gralonium } from "./Client.js";
import * as DJS from "discord.js";

export type ContextPayload =
  | string
  | ComponentsV2Builder
  | V2BuiltPayload
  | DJS.MessagePayload
  | DJS.MessageCreateOptions
  | DJS.InteractionReplyOptions
  | DJS.InteractionEditReplyOptions;

export interface ContextDeferOptions {
  ephemeral?: boolean;
  thinking?: boolean;
  thinkingText?: string;
  color?: ColorResolvable;
  reply?: boolean;
  typing?: boolean;
  flags?: number;
  allowedMentions?: DJS.MessageMentionOptions;
}

export interface ContextSendOptions {
  ephemeral?: boolean;
  suppressNotifications?: boolean;
  safeMentions?: boolean;
  allowedMentions?: DJS.MessageMentionOptions;
  files?: DJS.BaseMessageOptions["files"];
  reply?: boolean;
  followUp?: boolean;
  forceChannelSend?: boolean;
}

export declare class Context {
  bot: Gralonium;
  args: string[] | null;
  data: DJS.Message | DJS.CommandInteraction;
  prefix: string;
  isEditedMessage: boolean;
  command: Command<Types.Normal> | null;
  parent: Command<Types.Group> | null;
  params: P.BaseParam[] | null;
  constructor(bot: Gralonium, data: DJS.Message | DJS.CommandInteraction);
  get message(): DJS.Message | null;
  get interaction(): DJS.CommandInteraction | null;
  get author(): DJS.User;
  get user(): DJS.User;
  get isPrefix(): boolean;
  get isInteraction(): boolean;
  get isSlash(): boolean;
  get channel(): DJS.TextBasedChannel | null;
  get member(): DJS.GuildMember | DJS.APIInteractionGuildMember | null;
  get guild(): DJS.Guild | null;
  defer(options?: ContextDeferOptions): Promise<DJS.Message<boolean> | DJS.InteractionResponse<boolean> | null>;
  send(payload: ContextPayload, options?: ContextSendOptions): Promise<DJS.Message<boolean>>;
  reply(payload: ContextPayload, options?: ContextSendOptions): Promise<DJS.Message<boolean>>;
  ephemeral(payload: ContextPayload, options?: ContextSendOptions): Promise<DJS.Message<boolean>>;
  react(...emojis: string[]): Promise<DJS.MessageReaction | undefined>;
  get<T>(param: string): T | null;
}
