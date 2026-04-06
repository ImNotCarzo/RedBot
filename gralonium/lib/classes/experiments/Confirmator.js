"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Confirmator = void 0;

const discord_js_1 = require("discord.js");

class Confirmator {
  _author;
  _continue = async () => null;
  _cancel = async (interaction) => interaction.reply({ content: "Cancelled process.", ephemeral: true });
  _filter = async (interaction) => interaction.reply({ content: "This interaction isn't for you!", ephemeral: true });
  filter = async (interaction) => interaction.user.id !== this._author.id;
  timeout;
  message;
  bot;

  constructor(bot, options) {
    this._author = options.author;
    this.bot = bot;
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
    const continueButton = new discord_js_1.ButtonBuilder()
      .setLabel(options?.continue?.label || "Continue")
      .setStyle(discord_js_1.ButtonStyle.Danger)
      .setCustomId("continueButton");

    const cancelButton = new discord_js_1.ButtonBuilder()
      .setLabel(options?.cancel?.label || "Cancel")
      .setStyle(discord_js_1.ButtonStyle.Success)
      .setCustomId("cancelButton");

    return new discord_js_1.ActionRowBuilder().addComponents(continueButton, cancelButton).toJSON();
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
      throw new Error("Confirmator.start() requires a message via setMessage().");
    }

    const collector = this.message.createMessageComponentCollector({
      time: this.timeout * 1000,
      componentType: discord_js_1.ComponentType.Button,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId !== "continueButton" && interaction.customId !== "cancelButton") {
        return;
      }

      if (await this.filter(interaction)) {
        await this._filter(interaction);
        return;
      }

      if (interaction.customId === "continueButton") {
        await interaction.deferUpdate();
        await collector.stop("confirmed");
        await this._continue(interaction);
        return;
      }

      await interaction.deferUpdate();
      await collector.stop("cancelled");
      await this._cancel(interaction);
    });

    collector.on("end", async () => {
      await this.#disableMessageComponents();
    });
  }
}

exports.Confirmator = Confirmator;
