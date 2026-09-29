import { User, Message, CollectedInteraction } from "discord.js";
import { AsyncFunction } from "../Loader.js";
import { Gralonium } from "../Client.js";
export type ConfirmatorOptions = {
    author: User;
    filter?: ConfirmatorProcess;
    timeout?: number;
};
export type ConfirmatorProcess = AsyncFunction<CollectedInteraction, any>;
export type ConfirmatorButtonsOptions = {
    continue?: {
        label?: string;
    };
    cancel?: {
        label?: string;
    };
};
export declare class Confirmator {
    private _author;
    private _continue;
    private _cancel;
    private _filter;
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
    static Buttons(options?: ConfirmatorButtonsOptions): import("discord.js").APIActionRowComponent<import("discord.js").APIStringSelectComponent | import("discord.js").APIChannelSelectComponent | import("discord.js").APIMentionableSelectComponent | import("discord.js").APIUserSelectComponent | import("discord.js").APIRoleSelectComponent | import("discord.js").APIButtonComponent | import("discord.js").APITextInputComponent>;
    start(): void;
}
