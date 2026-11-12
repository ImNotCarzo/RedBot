import { ButtonStyle, CollectedInteraction, InteractionCollector, Message, User } from "discord.js";
import type { ButtonStyleResolvable } from "../builders/ComponentsV2Builder.js";
import type { EmojiInput } from "../builders/components/helpers.js";
import { AsyncFunction } from "../Loader.js";
import { Gralonium } from "../Client.js";

export type ButtonSchema = {
  style?: ButtonStyle | ButtonStyleResolvable;
  label?: string;
  emoji?: EmojiInput;
  customId?: string;
  disabled?: boolean;
};

export type PaginatorProcess = AsyncFunction<CollectedInteraction, any>;

export type PaginatorOptions<P = any> = {
  pages: P[];
  author: User;
  filter?: PaginatorProcess;
  timeout?: number;
  previousId?: string;
  nextId?: string;
  disableOnEnd?: boolean;
};

export type PaginatorButtonsOptions = {
  next?: ButtonSchema;
  previous?: ButtonSchema;
};

export declare class Paginator<P = any> {
  pages: P[];
  filter: PaginatorProcess;
  bot: Gralonium;
  message?: Message;
  timeout: number;
  constructor(bot: Gralonium, options: PaginatorOptions<P>);
  get page(): P;
  get pageNumber(): number;
  get pagesFooter(): string;
  setUpdateProcess(predicate: AsyncFunction<P, any>): this;
  setFilterProcess(predicate: PaginatorProcess): this;
  setFilterCheckProcess(predicate: PaginatorProcess): this;
  setMessage(message: Message): this;
  static Buttons(
    options?: PaginatorButtonsOptions
  ): import("discord.js").APIActionRowComponent<
    | import("discord.js").APIStringSelectComponent
    | import("discord.js").APIChannelSelectComponent
    | import("discord.js").APIMentionableSelectComponent
    | import("discord.js").APIUserSelectComponent
    | import("discord.js").APIRoleSelectComponent
    | import("discord.js").APIButtonComponent
    | import("discord.js").APITextInputComponent
  >;
  start(): InteractionCollector<any>;
}
