"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gralonium = exports.Erine = exports.Enire = exports.RedBot = void 0;

const discord_js_1 = require("discord.js");
const Context_js_1 = require("./Context.js");
const Loader_js_1 = require("./Loader.js");
const Cooldowns_js_1 = require("./Cooldowns.js");
const Utils_js_1 = require("./Utils.js");

class RedBot extends discord_js_1.Client {
  static #processHandlersBound = false;
  static #boundClients = new Set();

  cooldowns = new Cooldowns_js_1.Cooldowns(this);
  loader = new Loader_js_1.Loader({ client: this });
  ops;
  #coreListenersBound = false;

  constructor(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Client options are required.");
    }

    if (options.intents === undefined) {
      throw new TypeError("Missing required client option: intents.");
    }

    if (!("prefix" in options)) {
      throw new TypeError("Missing required framework option: prefix.");
    }

    super(options);
    this.ops = options;

    if (this.ops.guildOnly === undefined) this.ops.guildOnly = true;
    if (typeof this.ops.debug !== "boolean") this.ops.debug = false;
  }

  addGlobalPlugins(plugins) {
    this.loader.globalPlugins.push(...plugins);
    return this;
  }

  getContext(data) {
    return new (this.ops.context || Context_js_1.Context)(this, data);
  }

  async load(dir, reload = false) {
    if (!dir) throw new SyntaxError("Missing module path in Gralonium#load!");
    return this.loader.load(dir, reload);
  }

  async sync(guildIDs) {
    await this.loader.sync(guildIDs);
  }

  #debug(message) {
    if (!this.ops.debug) return;
    this.emit("debug", `[gralonium] ${message}`);
  }

  handleFrameworkError(error, ctx = null) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const summary = `${normalized.name}: ${normalized.message}`;
    this.#debug(summary);

    this.emit("frameworkError", normalized, ctx);
    if (this.listenerCount("error") > 0) {
      this.emit("error", normalized);
    }
  }

  #bindCoreListeners() {
    if (this.#coreListenersBound) return;

    this.on("messageCreate", async (message) => {
      try {
        await Utils_js_1.Utils.handleMessage(this, message, false);
      } catch (error) {
        this.handleFrameworkError(error, error?.ctx ?? null);
      }
    });

    if (this.ops.replyOnEdit === true) {
      this.on("messageUpdate", async (_oldMessage, newMessage) => {
        try {
          await Utils_js_1.Utils.handleMessage(this, newMessage, true);
        } catch (error) {
          this.handleFrameworkError(error, error?.ctx ?? null);
        }
      });
    }

    this.on("interactionCreate", async (interaction) => {
      try {
        await Utils_js_1.Utils.handleInteraction(this, interaction);
      } catch (error) {
        this.handleFrameworkError(error, error?.ctx ?? null);
      }
    });

    this.#coreListenersBound = true;
  }

  static #bindProcessHandlers() {
    if (RedBot.#processHandlersBound) return;

    const dispatch = (error) => {
      for (const client of RedBot.#boundClients) {
        client.handleFrameworkError(error);
      }
    };

    process.on("uncaughtException", dispatch);
    process.on("unhandledRejection", dispatch);

    RedBot.#processHandlersBound = true;
  }

  #registerHelpCommand() {
    if (!this.ops.helpCommand) return;

    const help = new this.ops.helpCommand();
    if (!this.loader.commands.normal) this.loader.commands.normal = new discord_js_1.Collection();

    this.loader.commands.normal.set("help", {
      data: help.data,
      params: help.params,
      plugins: help.plugins,
      code: help.code.bind(help),
    });
  }

  async login(token) {
    if (this.ops.bindProcessHandlers !== false) {
      RedBot.#bindProcessHandlers();
      RedBot.#boundClients.add(this);
    }

    this.#bindCoreListeners();
    this.#registerHelpCommand();

    if (this.ops.debug) {
      this.rest.on("rateLimited", (details) => {
        this.#debug(`Rate limited: ${JSON.stringify(details)}`);
      });
    }

    return super.login(token);
  }

  destroy() {
    RedBot.#boundClients.delete(this);
    return super.destroy();
  }
}

exports.RedBot = RedBot;
exports.Enire = RedBot;
exports.Erine = RedBot;
exports.Gralonium = RedBot;
