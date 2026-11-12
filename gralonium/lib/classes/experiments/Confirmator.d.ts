import { CollectedInteraction, InteractionCollector, Message, User } from "discord.js";
import type { ButtonStyleResolvable } from "../builders/ComponentsV2Builder.js";
import type { EmojiInput } from "../builders/components/helpers.js";
import { AsyncFunction } from "../Loader.js";
import { Gralonium } from "../Client.js";

export type ConfirmatorOptions = {
  author: User;
  filter?: ConfirmatorProcess;
  timeout?: number;
  continueId?: string;
  cancelId?: string;
  disableOnEnd?: boolean;
};

export type ConfirmatorProcess = AsyncFunction<CollectedInteraction, any>;

export type ConfirmatorButtonSchema = {
  label?: string;
  style?: ButtonStyleResolvable;
  emoji?: EmojiInput;
  customId?: string;
};

export type ConfirmatorButtonsOptions = {
  continue?: ConfirmatorButtonSchema;
  cancel?: ConfirmatorButtonSchema;
};

export declare class Confirmator {
  filter: ConfirmatorProcess;
  timeout: number;
  message?: Message;
  bot: Gralonium;
  constructor(bot: Gralonium, options: ConfirmatorOptions);
  setContinueProcess(predicate: ConfirmatorProcess): this;
  setCancelProcess(predicate: ConfirmatorProcess): this;
  setFilterErrorProcess(predicate: ConfirmatorProcess): this;
  setFilterCheckProcess(predicate: ConfirmatorProcess): this;
  setMessage(message: Message): this;
  static Buttons(
    options?: ConfirmatorButtonsOptions
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
