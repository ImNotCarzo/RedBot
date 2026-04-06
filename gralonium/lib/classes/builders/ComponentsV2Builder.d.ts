import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { ButtonStyleInput } from "./components/StyleMapper.js";

/**
 * Fluent proxy returned by `ComponentsV2Builder#addSelectMenu()`.
 * Call `.end()` to return to the parent builder.
 */
export declare class SelectMenuProxy {
  /**
   * Add an option to the select menu.
   *
   * @param label       - Display label for the option
   * @param value       - Value submitted when the option is selected
   * @param emoji       - Unicode emoji (optional)
   * @param description - Short description shown below the label (optional)
   */
  addOption(label: string, value?: string, emoji?: string, description?: string): this;

  /** Return to the parent `ComponentsV2Builder`. */
  end(): ComponentsV2Builder;
}

/**
 * ComponentsV2Builder — a fluent builder that abstracts the complexity of
 * Discord.js Components V2 (Containers, Separators, TextDisplays, Buttons,
 * and StringSelectMenus).
 *
 * @example
 * ```ts
 * const components = new ComponentsV2Builder()
 *   .addText("## Welcome!")
 *   .addSeparator("small")
 *   .addButton("Click Me", "btn_1", "primary")
 *   .addButton("Cancel", "btn_2", "secondary")
 *   .build();
 *
 * interaction.reply({ components, flags: ComponentsV2Builder.flags });
 * ```
 */
export declare class ComponentsV2Builder {
  /**
   * Add a text display (markdown supported) to the container.
   */
  addText(content: string): this;

  /**
   * Add a separator to the container.
   *
   * @param spacing - "small" | "large" (defaults to "small")
   * @param divider - Whether to render a visual divider line (defaults to true)
   */
  addSeparator(spacing?: "small" | "large", divider?: boolean): this;

  /**
   * Add a single button to the container.
   * Buttons are batched and placed into ActionRows automatically (max 5 per row).
   *
   * @param label    - Button label text
   * @param customId - Custom ID (or URL for link buttons)
   * @param style    - "primary" | "secondary" | "success" | "danger" | "link"
   * @param url      - URL (only used when style is "link")
   */
  addButton(label: string, customId?: string, style?: ButtonStyleInput, url?: string): this;

  /**
   * Add multiple pre-built `ButtonBuilder` instances at once.
   * They are batched into ActionRows automatically (max 5 per row).
   */
  addButtons(...buttons: ButtonBuilder[]): this;

  /**
   * Add a `StringSelectMenu` to the container.
   * Returns a `SelectMenuProxy` for adding options fluently.
   * Call `.end()` on the proxy to return to this builder.
   *
   * @param customId    - Custom ID for the select menu
   * @param placeholder - Placeholder text (optional)
   */
  addSelectMenu(customId?: string, placeholder?: string): SelectMenuProxy;

  /**
   * Mark the container as a spoiler (blurred until clicked).
   */
  setSpoiler(spoiler: boolean): this;

  /**
   * Build and return the components array ready for
   * `interaction.reply({ components: builder.build(), flags: ComponentsV2Builder.flags })`.
   */
  build(): ContainerBuilder[];

  /**
   * The `MessageFlags` bitmask required for Components V2 messages.
   *
   * ```ts
   * interaction.reply({ components: builder.build(), flags: ComponentsV2Builder.flags });
   * ```
   */
  static readonly flags: MessageFlags;

  /**
   * Create a Confirm / Cancel button container.
   */
  static createConfirm(confirmId?: string, cancelId?: string): ComponentsV2Builder;

  /**
   * Create a ticket category select menu container.
   */
  static createTicketMenu(customId?: string): ComponentsV2Builder;

  /**
   * Create a plan selector container (bot / game / web hosting example).
   */
  static createPlanSelector(customId?: string): ComponentsV2Builder;

  /**
   * Create a role selector menu container.
   */
  static createRoleMenu(customId?: string): ComponentsV2Builder;
}
