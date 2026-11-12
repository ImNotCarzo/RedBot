"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Paginator = void 0;

const discord_js_1 = require("discord.js");
const helpers_js_1 = require("../builders/components/helpers.js");
const StyleMapper_js_1 = require("../builders/components/StyleMapper.js");
const ComponentsV2Builder_js_1 = require("../builders/ComponentsV2Builder.js");

class Paginator {
  pages;
  filter = async (interaction) => interaction.user.id !== this._author.id;
  bot;
  message;
  timeout;
  _author;
  _page = 0;
  _previousId = "previousButton";
  _nextId = "continueButton";
  _disableOnEnd = true;
  _filter = async (interaction) =>
    interaction.reply({ content: "This interaction isn't for you!", flags: discord_js_1.MessageFlags.Ephemeral });
  _update = async (content) => {
    if (ComponentsV2Builder_js_1.ComponentsV2Builder.isBuilder(content)) {
      return this.message.edit(content.toPayload());
    }
    if (content && typeof content === "object" && (content.components || content.embeds || content.content !== undefined)) {
      return this.message.edit(content);
    }
    return this.message.edit({ content: content.toString() });
  };

  constructor(bot, options) {
    this.bot = bot;
    this.pages = options.pages;
    this._author = options.author;
    if (options.filter) this.filter = options.filter;
    if (options.previousId) this._previousId = options.previousId;
    if (options.nextId) this._nextId = options.nextId;
    if (options.disableOnEnd !== undefined) this._disableOnEnd = Boolean(options.disableOnEnd);
    this.timeout = options.timeout ?? 60;
  }

  get page() {
    return this.pages[this._page];
  }

  get pageNumber() {
    return this._page + 1;
  }

  get pagesFooter() {
    return `${this._page + 1}/${this.pages.length}`;
  }

  setUpdateProcess(predicate) {
    this._update = predicate;
    return this;
  }

  setFilterProcess(predicate) {
    this._filter = predicate;
    return this;
  }

  setFilterCheckProcess(predicate) {
    this.filter = predicate;
    return this;
  }

  setMessage(message) {
    this.message = message;
    return this;
  }

  static Buttons(options) {
    const nextStyle = options?.next?.style !== undefined ? StyleMapper_js_1.mapButtonStyle(options.next.style) : discord_js_1.ButtonStyle.Primary;
    const prevStyle =
      options?.previous?.style !== undefined ? StyleMapper_js_1.mapButtonStyle(options.previous.style) : discord_js_1.ButtonStyle.Primary;

    const nextButton = new discord_js_1.ButtonBuilder()
      .setCustomId(options?.next?.customId || "continueButton")
      .setStyle(nextStyle)
      .setLabel(options?.next?.label || "Next");
    if (options?.next?.emoji) {
      const parsed = helpers_js_1.parseEmoji(options.next.emoji);
      if (parsed) nextButton.setEmoji(parsed);
    }
    if (options?.next?.disabled !== undefined) {
      nextButton.setDisabled(Boolean(options.next.disabled));
    }

    const previousButton = new discord_js_1.ButtonBuilder()
      .setCustomId(options?.previous?.customId || "previousButton")
      .setStyle(prevStyle)
      .setLabel(options?.previous?.label || "Previous");
    if (options?.previous?.emoji) {
      const parsed = helpers_js_1.parseEmoji(options.previous.emoji);
      if (parsed) previousButton.setEmoji(parsed);
    }
    if (options?.previous?.disabled !== undefined) {
      previousButton.setDisabled(Boolean(options.previous.disabled));
    }

    return new discord_js_1.ActionRowBuilder().addComponents(previousButton, nextButton).toJSON();
  }

  async #disableMessageComponents() {
    if (!this._disableOnEnd) return;
    await helpers_js_1.disableMessageComponents(this.message);
  }

  start() {
    if (!this.message) {
      throw new Error("Paginator.start() requires a message via setMessage().");
    }

    const collector = this.message.createMessageComponentCollector({
      time: this.timeout * 1000,
      componentType: discord_js_1.ComponentType.Button,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId !== this._previousId && interaction.customId !== this._nextId) {
        return;
      }

      if (await this.filter(interaction)) {
        await this._filter(interaction);
        return;
      }

      if (interaction.customId === this._previousId) {
        await interaction.deferUpdate();
        this._page = this._page <= 0 ? this.pages.length - 1 : this._page - 1;
        await this._update(this.pages[this._page]);
        return;
      }

      await interaction.deferUpdate();
      this._page = this._page + 1 >= this.pages.length ? 0 : this._page + 1;
      await this._update(this.pages[this._page]);
    });

    collector.on("end", async () => {
      await this.#disableMessageComponents();
    });

    return collector;
  }
}

exports.Paginator = Paginator;
