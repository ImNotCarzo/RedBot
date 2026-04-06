import { ButtonStyle } from "discord.js";

export type ButtonStyleName = "primary" | "secondary" | "success" | "danger" | "link";
export type ButtonStyleInput = ButtonStyleName | ButtonStyle;

/**
 * Maps a button style name (string) or ButtonStyle enum value to a ButtonStyle.
 * Defaults to Primary if the provided value is not recognized.
 */
export declare function mapButtonStyle(style?: ButtonStyleInput | null): ButtonStyle;
