import { User, Message, ButtonStyle, CollectedInteraction } from "discord.js";
import { AsyncFunction } from "../Loader.js";
import { Gralonium } from "../Client.js";
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
    bot: Gralonium;
    message?: Message;
    timeout: number;
    private _author;
    private _page;
    private _filter;
    private _update;
    constructor(bot: Gralonium, options: PaginatorOptions);
    get page(): P;
    get pageNumber(): number;
    get pagesFooter(): string;
    setUpdateProcess(predicate: AsyncFunction<P, any>): this;
    setFilterProcess(predicate: PaginatorProcess): this;
    setFilterCheckProcess(predicate: PaginatorProcess): this;
    setMessage(message: Message): this;
    static Buttons(options?: PaginatorButtonsOptions): import("discord.js").APIActionRowComponent<import("discord.js").APIStringSelectComponent | import("discord.js").APIChannelSelectComponent | import("discord.js").APIMentionableSelectComponent | import("discord.js").APIUserSelectComponent | import("discord.js").APIRoleSelectComponent | import("discord.js").APIButtonComponent | import("discord.js").APITextInputComponent>;
    start(): void;
}
