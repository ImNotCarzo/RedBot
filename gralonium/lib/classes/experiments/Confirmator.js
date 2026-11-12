"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Confirmator = void 0;

const discord_js_1 = require("discord.js");
const helpers_js_1 = require("../builders/components/helpers.js");
const StyleMapper_js_1 = require("../builders/components/StyleMapper.js");

class Confirmator {
  _author;
  _continue = async () => null;
  _cancel = async (interaction) => interaction.reply({ content: "Cancelled process.", flags: discord_js_1.MessageFlags.Ephemeral });
  _filter = async (interaction) =>
    interaction.reply({ content: "This interaction isn't for you!", flags: discord_js_1.MessageFlags.Ephemeral });
  filter = async (interaction) => interaction.user.id !== this._author.id;
  _continueId = "continueButton";
  _cancelId = "cancelButton";
  _disableOnEnd = true;
  timeout;
  message;
  bot;

  constructor(bot, options) {
    this._author = options.author;
    this.bot = bot;
    if (options.filter) this.filter = options.filter;
    if (options.continueId) this._continueId = options.continueId;
    if (options.cancelId) this._cancelId = options.cancelId;
    if (options.disableOnEnd !== undefined) this._disableOnEnd = Boolean(options.disableOnEnd);
    this.timeout = options.timeout ?? 60;
  }

  setContinueProcess(predicate) {
    this._continue = predicate;
    return this;
  }

  setCancelProcess(predicate) {
    this._cancel = predicate;
    return this;
  }

  setFilterErrorProcess(predicate) {
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
    const continueStyle =
      options?.continue?.style !== undefined ? StyleMapper_js_1.mapButtonStyle(options.continue.style) : discord_js_1.ButtonStyle.Danger;
    const cancelStyle =
      options?.cancel?.style !== undefined ? StyleMapper_js_1.mapButtonStyle(options.cancel.style) : discord_js_1.ButtonStyle.Success;

    const continueButton = new discord_js_1.ButtonBuilder()
      .setLabel(options?.continue?.label || "Continue")
      .setStyle(continueStyle)
      .setCustomId(options?.continue?.customId || "continueButton");
    if (options?.continue?.emoji) {
      const parsed = helpers_js_1.parseEmoji(options.continue.emoji);
      if (parsed) continueButton.setEmoji(parsed);
    }

    const cancelButton = new discord_js_1.ButtonBuilder()
      .setLabel(options?.cancel?.label || "Cancel")
      .setStyle(cancelStyle)
      .setCustomId(options?.cancel?.customId || "cancelButton");
    if (options?.cancel?.emoji) {
      const parsed = helpers_js_1.parseEmoji(options.cancel.emoji);
      if (parsed) cancelButton.setEmoji(parsed);
    }

    return new discord_js_1.ActionRowBuilder().addComponents(continueButton, cancelButton).toJSON();
  }

  async #disableMessageComponents() {
    if (!this._disableOnEnd) return;
    await helpers_js_1.disableMessageComponents(this.message);
  }

  start() {
    if (!this.message) {
      throw new Error("Confirmator.start() requires a message via setMessage().");
    }

    const collector = this.message.createMessageComponentCollector({
      time: this.timeout * 1000,
      componentType: discord_js_1.ComponentType.Button,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId !== this._continueId && interaction.customId !== this._cancelId) {
        return;
      }

      if (await this.filter(interaction)) {
        await this._filter(interaction);
        return;
      }

      if (interaction.customId === this._continueId) {
        await interaction.deferUpdate();
        collector.stop("confirmed");
        await this._continue(interaction);
        return;
      }

      await interaction.deferUpdate();
      collector.stop("cancelled");
      await this._cancel(interaction);
    });

    collector.on("end", async () => {
      await this.#disableMessageComponents();
    });

    return collector;
  }
}

exports.Confirmator = Confirmator;
