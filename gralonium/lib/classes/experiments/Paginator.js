"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Paginator = void 0;

const discord_js_1 = require("discord.js");

class Paginator {
  pages;
  filter = async (interaction) => interaction.user.id !== this._author.id;
  bot;
  message;
  timeout;
  _author;
  _page = 0;
  _filter = async (interaction) => interaction.reply({ content: "This interaction isn't for you!", ephemeral: true });
  _update = async (content) => this.message.edit({ content: content.toString() });

  constructor(bot, options) {
    this.bot = bot;
    this.pages = options.pages;
    this._author = options.author;
    if (options.filter) this.filter = options.filter;
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
    const nextButton = new discord_js_1.ButtonBuilder()
      .setCustomId("continueButton")
      .setStyle(options?.previous?.style || discord_js_1.ButtonStyle.Primary)
      .setLabel(options?.next?.label || "Next");

    const previousButton = new discord_js_1.ButtonBuilder()
      .setCustomId("previousButton")
      .setStyle(options?.previous?.style || discord_js_1.ButtonStyle.Primary)
      .setLabel(options?.previous?.label || "Previous");

    return new discord_js_1.ActionRowBuilder().addComponents(previousButton, nextButton).toJSON();
  }

  async #disableMessageComponents() {
    if (!this.message?.editable || !this.message.components?.length) return;

    const components = this.message.components.map((row) => {
      const cloned = discord_js_1.ActionRowBuilder.from(row);
      for (const component of cloned.components) {
        component.setDisabled(true);
      }
      return cloned;
    });

    await this.message.edit({ components }).catch(() => null);
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
      if (interaction.customId !== "previousButton" && interaction.customId !== "continueButton") {
        return;
      }

      if (await this.filter(interaction)) {
        await this._filter(interaction);
        return;
      }

      if (interaction.customId === "previousButton") {
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
  }
}

exports.Paginator = Paginator;
