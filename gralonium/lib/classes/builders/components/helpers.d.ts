import { APIMessageComponent, APIMessageComponentEmoji, Message, RGBTuple } from "discord.js";

export declare const MAX_V2_TEXT_LENGTH = 4000;
export declare const SAFE_V2_TEXT_LENGTH = 3950;
export declare const MAX_V2_COMPONENTS = 40;
export declare const MAX_V2_TOP_LEVEL_COMPONENTS = 10;

export type AccentColorInput = number | string | RGBTuple | null | undefined;
export type EmojiInput = string | APIMessageComponentEmoji | null | undefined;

export interface DisableComponentsOptions {
  disableButtons?: boolean;
  disableSelects?: boolean;
  disableLinks?: boolean;
}

/**
 * Validates that text content is non-empty.
 * Returns false if `ignoreEmpty` is true and content is blank.
 */
export declare function validateTextContent(content: unknown, options?: { ignoreEmpty?: boolean }): boolean;

/**
 * Validates that a button row does not exceed 5 buttons.
 */
export declare function validateButtonCount(count: number): void;

/**
 * Validates that a select menu does not exceed 25 options.
 */
export declare function validateSelectMenuOptions(count: number): void;

/**
 * Generates a unique custom ID with an optional prefix.
 */
export declare function generateCustomId(prefix?: string): string;

/**
 * Resolves a hex string, RGB tuple, integer, or preset name into a 24-bit color integer.
 */
export declare function resolveAccentColor(color?: AccentColorInput, fallback?: AccentColorInput): number | null;

/**
 * Checks whether a URL is valid for Discord media components (`http://`, `https://`, `attachment://`).
 */
export declare function isValidMediaUrl(url: unknown): url is string;

/**
 * Checks whether a URL is valid for Discord link buttons (`http://`, `https://`, `discord://`).
 */
export declare function isValidLinkUrl(url: unknown): url is string;

/**
 * Parses unicode, `<:name:id>`, `<a:name:id>`, `name:id`, snowflake ID, or emoji object into API emoji shape.
 */
export declare function parseEmoji(emoji: EmojiInput): APIMessageComponentEmoji | null;

/**
 * Clips text to `maxLen`, appending `…` if truncated.
 */
export declare function clipText(text: unknown, maxLen?: number, fallback?: string): string;

/**
 * Returns true if the numeric component type is a Discord Components V2 type.
 */
export declare function isV2ComponentType(type: number): boolean;

/**
 * Counts total characters across all TextDisplay components in a component array.
 */
export declare function countTextLength(components: unknown[]): number;

/**
 * Counts total component nodes (including nested Container, Section, ActionRow, and MediaGallery items).
 */
export declare function countComponents(components: unknown[]): number;

/**
 * Recursively clones and disables buttons/selects in both V1 ActionRows and V2 Containers/Sections.
 */
export declare function disableComponents(components: unknown[], options?: DisableComponentsOptions): APIMessageComponent[];

/**
 * Edits a Discord message to recursively disable its V1 or V2 interactive components.
 */
export declare function disableMessageComponents(message: Message | null | undefined, options?: DisableComponentsOptions): Promise<Message | null>;
