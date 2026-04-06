import { User, Message, CollectedInteraction } from "discord.js";
import { AsyncFunction } from "../Loader.js";
import { Erine } from "../Client.js";
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
    bot: Erine;
    constructor(bot: Erine, options: ConfirmatorOptions);
    /**
     *
     * @param predicate The function to call when someone clicks the continue button
     */
    setContinueProcess(predicate: ConfirmatorProcess): this;
    /**
     * @param predicate The function to call when someone clicks the cancel button.
     */
    setCancelProcess(predicate: ConfirmatorProcess): this;
    /**
     * @param predicate The function to call when the filter process returns false
     */
    setFilterErrorProcess(predicate: ConfirmatorProcess): this;
    /**
     * @param predicate The function to call and check if is true, if not  it will throw an error (setted with .setFilterErrorProcess())
     */
    setFilterCheckProcess(predicate: ConfirmatorProcess): this;
    /**
     * You have to use this after you send the message with the buttons, this is required.
     * @param message The message that will be used in the process
     */
    setMessage(message: Message): this;
    /**
     * @param options Optional options to customize your buttons
     */
    static Buttons(options?: ConfirmatorButtonsOptions): import("discord.js").APIActionRowComponent<import("discord.js").APIStringSelectComponent | import("discord.js").APIChannelSelectComponent | import("discord.js").APIMentionableSelectComponent | import("discord.js").APIUserSelectComponent | import("discord.js").APIRoleSelectComponent | import("discord.js").APIButtonComponent | import("discord.js").APITextInputComponent>;
    /**
     * Start the confirmator, we recommend you to start it after using Confirmator.setMessage()
     */
    start(): void;
}
