import { Command, Types } from "../classes/Loader.js";
import * as P from "./builders/ParamsBuilder.js";
import { Enire } from "./Client.js";
import * as DJS from "discord.js";

export declare class Context {
  bot: Enire;
  args: string[] | null;
  data: DJS.Message | DJS.CommandInteraction;
  prefix: string;
  isEditedMessage: boolean;
  command: Command<Types.Normal> | null;
  parent: Command<Types.Group> | null;
  params: P.BaseParam[] | null;
  constructor(bot: Enire, data: DJS.Message | DJS.CommandInteraction);
  get message(): DJS.Message | null;
  get interaction(): DJS.CommandInteraction | null;
  get author(): DJS.User;
  get channel(): DJS.TextBasedChannel | null;
  get member(): DJS.GuildMember | DJS.APIInteractionGuildMember | null;
  get guild(): DJS.Guild | null;
  send(payload: string | DJS.MessagePayload | DJS.MessageCreateOptions | DJS.InteractionReplyOptions | DJS.InteractionEditReplyOptions): Promise<DJS.Message<boolean>>;
  react(...emojis: string[]): Promise<DJS.MessageReaction | undefined>;
  get<T>(param: string): T | null;
}
