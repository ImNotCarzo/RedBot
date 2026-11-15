"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParamsBuilder = void 0;

const discord_js_1 = require("discord.js");
const CommandBuilder_js_1 = require("./CommandBuilder.js");

const INTERNAL_RUNTIME_KEYS = new Set([
  "ellipsis",
  "value",
  "minLength",
  "maxLength",
  "minValue",
  "maxValue",
  "channelTypes",
  "nameLocalizations",
  "descriptionLocalizations",
]);

function normalizeChoices(choices) {
  if (!Array.isArray(choices)) return undefined;
  return choices.map((choice) => {
    const out = {
      name: String(choice.name),
      value: choice.value,
    };
    const nameLocs = (0, CommandBuilder_js_1.normalizeNameLocalizations)(
      choice.name_localizations ?? choice.nameLocalizations
    );
    if (nameLocs) {
      out.name_localizations = nameLocs;
    }
    return out;
  });
}

class ParamsBuilder {
  params = [];
  quoted = true;

  setQuoted(value) {
    this.quoted = value;
    return this;
  }

  #normalizeParam(param, type) {
    const normalized = { ...param, type };

    if (normalized.description !== undefined) {
      normalized.description = String(normalized.description ?? "...").slice(0, 100);
    }

    if (normalized.min_length === undefined && normalized.minLength !== undefined) {
      normalized.min_length = normalized.minLength;
    }
    if (normalized.max_length === undefined && normalized.maxLength !== undefined) {
      normalized.max_length = normalized.maxLength;
    }
    if (normalized.min_value === undefined && normalized.minValue !== undefined) {
      normalized.min_value = normalized.minValue;
    }
    if (normalized.max_value === undefined && normalized.maxValue !== undefined) {
      normalized.max_value = normalized.maxValue;
    }
    if (normalized.channel_types === undefined && normalized.channelTypes !== undefined) {
      normalized.channel_types = normalized.channelTypes;
    }

    const nameLocs = (0, CommandBuilder_js_1.normalizeNameLocalizations)(
      normalized.name_localizations ?? normalized.nameLocalizations
    );
    if (nameLocs) {
      normalized.name_localizations = nameLocs;
    } else {
      delete normalized.name_localizations;
    }

    const descLocs = (0, CommandBuilder_js_1.normalizeDescriptionLocalizations)(
      normalized.description_localizations ?? normalized.descriptionLocalizations
    );
    if (descLocs) {
      normalized.description_localizations = descLocs;
    } else {
      delete normalized.description_localizations;
    }

    delete normalized.minLength;
    delete normalized.maxLength;
    delete normalized.minValue;
    delete normalized.maxValue;
    delete normalized.channelTypes;
    delete normalized.nameLocalizations;
    delete normalized.descriptionLocalizations;

    if (normalized.choices !== undefined) {
      normalized.choices = normalizeChoices(normalized.choices);
    }

    return normalized;
  }

  addString(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.String));
    return this;
  }

  addNumber(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.Number));
    return this;
  }

  addInteger(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.Integer));
    return this;
  }

  addBoolean(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.Boolean));
    return this;
  }

  addMember(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.User));
    return this;
  }

  addUser(param) {
    return this.addMember(param);
  }

  addChannel(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.Channel));
    return this;
  }

  addRole(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.Role));
    return this;
  }

  addAttachment(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.Attachment));
    return this;
  }

  addMentionable(param) {
    this.params.push(this.#normalizeParam(param, discord_js_1.ApplicationCommandOptionType.Mentionable));
    return this;
  }

  /**
   * Serializes options cleanly for Discord ApplicationCommand registration,
   * omitting prefix-only runtime fields such as `ellipsis` and `value`.
   */
  toJSON() {
    return this.params.map((param) => {
      const json = {};
      for (const [key, val] of Object.entries(param)) {
        if (INTERNAL_RUNTIME_KEYS.has(key) || val === undefined) continue;
        json[key] = val;
      }
      return json;
    });
  }
}

exports.ParamsBuilder = ParamsBuilder;
