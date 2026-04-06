/**
 * Validates that text content is non-empty.
 * Throws a descriptive error if validation fails.
 */
export declare function validateTextContent(content: unknown): void;

/**
 * Validates that a button row does not exceed 5 buttons.
 * Throws a descriptive error if validation fails.
 */
export declare function validateButtonCount(count: number): void;

/**
 * Validates that a select menu does not exceed 25 options.
 * Throws a descriptive error if validation fails.
 */
export declare function validateSelectMenuOptions(count: number): void;

/**
 * Generates a unique custom ID with an optional prefix.
 */
export declare function generateCustomId(prefix?: string): string;
