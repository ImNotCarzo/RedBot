import { ButtonStyle } from "discord.js";

export type ButtonStyleName = "primary" | "secondary" | "success" | "danger" | "link" | "premium";
export type ButtonStyleInput = ButtonStyleName | ButtonStyle;

/**
 * Sets the default fallback button style used when no explicit style is provided.
 */
export declare function setDefaultButtonStyle(style?: ButtonStyleInput | null): ButtonStyle;
export declare const setDefaultStyle: typeof setDefaultButtonStyle;

/**
 * Returns the current default fallback button style.
 */
export declare function getDefaultButtonStyle(): ButtonStyle;
export declare const getDefaultStyle: typeof getDefaultButtonStyle;

/**
 * Maps a button style name (string) or ButtonStyle enum value to a ButtonStyle.
 * Defaults to the configured default button style (Secondary by default) if not recognized.
 */
export declare function mapButtonStyle(style?: ButtonStyleInput | null): ButtonStyle;
