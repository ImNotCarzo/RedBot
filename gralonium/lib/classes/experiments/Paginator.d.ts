import { User, Message, ButtonStyle, CollectedInteraction } from "discord.js";
import { AsyncFunction } from "../Loader.js";
import { Erine } from "../Client.js";
export type ButtonSchema = {
    style?: ButtonStyle;
    label?: string;
};
export type PaginatorProcess = AsyncFunction<CollectedInteraction, boolean>;
export type PaginatorOptions<P = any> = {
    pages: P[];
    author: User;
    filter?: PaginatorProcess;
    timeout?: number;
};
export type PaginatorButtonsOptions = {
    next?: ButtonSchema;
    previous?: ButtonSchema;
};
export declare class Paginator<P = any> {
    pages: P[];
    filter: PaginatorProcess;
    bot: Erine;
    message?: Message;
    timeout: number;
    private _author;
    private _page;
    private _filter;
    private _update;
    constructor(bot: Erine, options: PaginatorOptions);
    /**
     * Get the page content (provided in the constructor).
     */
    get page(): P;
    /**
     * Get the current page number.
     */
    get pageNumber(): number;
    /**
     * Get the page footer.
     * @example "3/10"
     */
    get pagesFooter(): string;
    /**
     * @param predicate The function to call when someone clicks the cancel button.
     */
    setUpdateProcess(predicate: AsyncFunction<P, any>): this;
    /**
     * @param predicate The function to call when the filter process returns false
     */
    setFilterProcess(predicate: PaginatorProcess): this;
    /**
     * @param predicate The function to call and check if is true, if not  it will throw an error (setted with .setFilterErrorProcess())
     */
    setFilterCheckProcess(predicate: PaginatorProcess): this;
    /**
     * You have to use this after you send the message with the buttons, this is required.
     * @param message The message that will be used in the process
     */
    setMessage(message: Message): this;
    /**
     * @param options Optional options to customize your buttons
     */
    static Buttons(options?: PaginatorButtonsOptions): import("discord.js").APIActionRowComponent<import("discord.js").APIStringSelectComponent | import("discord.js").APIChannelSelectComponent | import("discord.js").APIMentionableSelectComponent | import("discord.js").APIUserSelectComponent | import("discord.js").APIRoleSelectComponent | import("discord.js").APIButtonComponent | import("discord.js").APITextInputComponent>;
    start(): void;
}
