"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentsV2Builder = void 0;

const discord_js_1 = require("discord.js");
const StyleMapper_js_1 = require("./components/StyleMapper.js");
const helpers_js_1 = require("./components/helpers.js");

/**
 * SelectMenuProxy gives a chainable API to add options to a StringSelectMenu
 * and then return to the parent ComponentsV2Builder via `.end()`.
 */
class SelectMenuProxy {
  constructor(parent, menu) {
    this._parent = parent;
    this._menu = menu;
    this._optionCount = 0;
  }

  /**
   * Add an option to the select menu.
   */
  addOption(label, value, emoji, description) {
    this._optionCount += 1;
    helpers_js_1.validateSelectMenuOptions(this._optionCount);

    const option = new discord_js_1.StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(value ?? helpers_js_1.generateCustomId("opt"));

    if (emoji) option.setEmoji({ name: emoji });
    if (description) option.setDescription(description);

    this._menu.addOptions(option);
    return this;
  }

  /**
   * Return to the parent builder to continue chaining.
   */
  end() {
    return this._parent;
  }
}

/**
 * ComponentsV2Builder — a fluent builder that abstracts the complexity of
 * Discord.js Components V2 (Containers, Separators, TextDisplays, Buttons,
 * and StringSelectMenus).
 *
 * @example
 * ```js
 * const { ComponentsV2Builder } = require("gralonium");
 *
 * const components = new ComponentsV2Builder()
 *   .addText("## Welcome!")
 *   .addSeparator("small")
 *   .addButton("Click Me", "btn_1", "primary")
 *   .addButton("Cancel", "btn_2", "secondary")
 *   .build();
 *
 * interaction.reply({ components });
 * ```
 */
class ComponentsV2Builder {
  constructor() {
    this._container = new discord_js_1.ContainerBuilder();
    this._pendingButtons = [];
    this._spoiler = false;
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  /**
   * Flush any pending buttons into an ActionRow inside the container.
   */
  _flushButtons() {
    if (this._pendingButtons.length === 0) return;
    const row = new discord_js_1.ActionRowBuilder().addComponents(...this._pendingButtons);
    this._container.addActionRowComponents(row);
    this._pendingButtons = [];
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Add a text display (markdown supported) to the container.
   */
  addText(content) {
    helpers_js_1.validateTextContent(content);
    this._flushButtons();
    this._container.addTextDisplayComponents(
      new discord_js_1.TextDisplayBuilder().setContent(content)
    );
    return this;
  }

  /**
   * Add a separator to the container.
   *
   * @param spacing - "small" | "large" (defaults to "small")
   * @param divider - Whether to render a visual divider line (defaults to true)
   */
  addSeparator(spacing, divider) {
    this._flushButtons();
    const spacingValue =
      spacing === "large"
        ? discord_js_1.SeparatorSpacingSize.Large
        : discord_js_1.SeparatorSpacingSize.Small;
    const sep = new discord_js_1.SeparatorBuilder()
      .setSpacing(spacingValue)
      .setDivider(divider !== false);
    this._container.addSeparatorComponents(sep);
    return this;
  }

  /**
   * Add a single button to the container.
   * Buttons are batched and placed into ActionRows automatically (max 5 per row).
   *
   * @param label     - Button label text
   * @param customId  - Custom ID (or URL for link buttons)
   * @param style     - "primary" | "secondary" | "success" | "danger" | "link"
   * @param url       - URL (only used when style is "link")
   */
  addButton(label, customId, style, url) {
    const resolvedStyle = StyleMapper_js_1.mapButtonStyle(style);

    // If we already have 5 buttons pending, flush them first
    if (this._pendingButtons.length >= 5) {
      this._flushButtons();
    }

    const btn = new discord_js_1.ButtonBuilder()
      .setLabel(label)
      .setStyle(resolvedStyle);

    if (resolvedStyle === discord_js_1.ButtonStyle.Link) {
      if (!url) throw new Error("[ComponentsV2Builder] A link button requires a URL.");
      if (customId) {
        console.warn("[ComponentsV2Builder] customId is ignored for link buttons; use the 'url' parameter instead.");
      }
      btn.setURL(url);
    } else {
      btn.setCustomId(customId ?? helpers_js_1.generateCustomId("btn"));
    }

    this._pendingButtons.push(btn);
    return this;
  }

  /**
   * Add multiple pre-built ButtonBuilder instances at once.
   * They are batched into ActionRows automatically (max 5 per row).
   */
  addButtons(...buttons) {
    for (const btn of buttons) {
      if (this._pendingButtons.length >= 5) {
        this._flushButtons();
      }
      this._pendingButtons.push(btn);
    }
    return this;
  }

  /**
   * Add a StringSelectMenu to the container and return a SelectMenuProxy
   * for adding options via a fluent sub-chain. Call `.end()` on the proxy
   * to return to this builder.
   *
   * @param customId    - Custom ID for the select menu
   * @param placeholder - Placeholder text (optional)
   */
  addSelectMenu(customId, placeholder) {
    this._flushButtons();
    const menu = new discord_js_1.StringSelectMenuBuilder()
      .setCustomId(customId ?? helpers_js_1.generateCustomId("sel"))
      .setPlaceholder(placeholder ?? "Select an option...");

    // We need to add the row after options are configured; the proxy returns
    // to us via `.end()` which flushes remaining buttons and adds the row.
    // To support immediate chaining, we attach the row now — options get added
    // by the proxy in-place (discord.js builders are mutable).
    const row = new discord_js_1.ActionRowBuilder().addComponents(menu);
    this._container.addActionRowComponents(row);
    return new SelectMenuProxy(this, menu);
  }

  /**
   * Mark the container as a spoiler (blurred until clicked).
   */
  setSpoiler(spoiler) {
    this._spoiler = spoiler;
    this._container.setSpoiler(spoiler);
    return this;
  }

  /**
   * Build and return the components array ready to pass to
   * `interaction.reply({ components })`.
   *
   * The `MessageFlags.IsComponentsV2` flag is **not** added here because it
   * must be set on the reply options object itself, not inside the components
   * array. Use the helper `ComponentsV2Builder.flags` constant when replying:
   *
   * ```js
   * interaction.reply({ components: builder.build(), flags: ComponentsV2Builder.flags });
   * ```
   */
  build() {
    this._flushButtons();
    return [this._container];
  }

  // ─── Static helpers ──────────────────────────────────────────────────────

  /**
   * The MessageFlags bitmask required for Components V2 messages.
   *
   * ```js
   * interaction.reply({ components: builder.build(), flags: ComponentsV2Builder.flags });
   * ```
   */
  static get flags() {
    return discord_js_1.MessageFlags.IsComponentsV2;
  }

  // ─── Quick Templates ─────────────────────────────────────────────────────

  /**
   * Create a Confirm / Cancel button container.
   *
   * @param confirmId - Custom ID for the confirm button (default: "cv2_confirm")
   * @param cancelId  - Custom ID for the cancel button (default: "cv2_cancel")
   */
  static createConfirm(confirmId, cancelId) {
    return new ComponentsV2Builder()
      .addText("**Are you sure?**")
      .addSeparator("small")
      .addButton("Confirm", confirmId ?? "cv2_confirm", "success")
      .addButton("Cancel", cancelId ?? "cv2_cancel", "danger");
  }

  /**
   * Create a ticket category select menu container.
   *
   * @param customId - Custom ID for the select menu (default: "cv2_ticket_menu")
   */
  static createTicketMenu(customId) {
    return new ComponentsV2Builder()
      .addText("## 🎫 Open a Ticket")
      .addSeparator("small")
      .addSelectMenu(customId ?? "cv2_ticket_menu", "Select a category...")
        .addOption("General Support", "ticket_general", "❓")
        .addOption("Billing", "ticket_billing", "💳")
        .addOption("Technical Issue", "ticket_tech", "🔧")
        .end();
  }

  /**
   * Create a plan selector container (bot / game / web hosting example).
   *
   * @param customId - Custom ID for the select menu (default: "cv2_plan_menu")
   */
  static createPlanSelector(customId) {
    return new ComponentsV2Builder()
      .addText("## Welcome!\nPlease select the plan you want to join!")
      .addSeparator("small")
      .addButton("Discord Bot Hosting", "plan_bot", "primary")
      .addButton("Game Hosting", "plan_game", "success")
      .addButton("Web Hosting", "plan_web", "danger");
  }

  /**
   * Create a role selector menu container.
   *
   * @param customId - Custom ID for the select menu (default: "cv2_role_menu")
   */
  static createRoleMenu(customId) {
    return new ComponentsV2Builder()
      .addText("## 🎭 Select a Role")
      .addSeparator("small")
      .addSelectMenu(customId ?? "cv2_role_menu", "Choose your role...")
        .end();
  }
}
exports.ComponentsV2Builder = ComponentsV2Builder;
