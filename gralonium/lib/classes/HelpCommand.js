"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HelpCommand = void 0;

const discord_js_1 = require("discord.js");
const { CommandBuilder } = require("./builders/CommandBuilder.js");
const { ParamsBuilder } = require("./builders/ParamsBuilder.js");
const { ComponentsV2Builder } = require("./builders/ComponentsV2Builder.js");
const { V2Paginator } = require("./views/V2Paginator.js");

const DEFAULT_LABELS = {
  welcomeTitle: "Help",
  welcomeDescription: "Welcome to my help",
  notFound: "I was unable to find something related to that!",
  usage: "Usage",
  arguments: "Arguments",
  noArguments: "Without arguments.",
  subcommands: "Subcommands",
  noSubcommands: "Without sub commands.",
  commandsHeader: "Available commands",
  footerSuffix: "'s Help",
};

/**
 * Built-in help command supporting both classic Embed mode (default for backwards compatibility)
 * and rich Components V2 mode (`useV2: true`) with optional pagination and custom labels.
 */
class HelpCommand {
  options;
  labels;
  data;
  plugins;
  params;

  constructor(options = {}) {
    this.options = options || {};
    this.labels = { ...DEFAULT_LABELS, ...(this.options.labels || {}) };
    this.plugins = Array.isArray(this.options.plugins) ? this.options.plugins : [];

    this.data = new CommandBuilder({
      name: this.options.name || "help",
      aliases: this.options.aliases || ["h"],
      description: this.options.description || "Shows this command",
    });

    this.params = new ParamsBuilder().addString({
      name: "query",
      description: this.options.queryDescription || "An optional command/group/subcommand name",
      required: false,
      ellipsis: true,
    });
  }

  async code(ctx) {
    const query = ctx.get("query");
    if (!query) {
      return this.sendEmpty(ctx);
    }

    const command = this.getCommand(ctx, query);
    if (command) {
      return this.sendCommand(ctx, command);
    }

    const group = this.getGroup(ctx, query);
    if (group) {
      return this.sendGroup(ctx, group);
    }

    return this.sendNotFound(ctx);
  }

  #getVisibleCommandEntries(ctx) {
    const hidden = new Set((this.options.hiddenCommands || []).map((n) => this.c(String(n))));
    const prefix = ctx.prefix || "/";
    const commands = ctx.bot.loader.walkCommands();
    const seenGroups = new Set();
    const entries = [];

    for (const entry of commands) {
      const name = entry.group ? `${entry.group.data.name} ${entry.data.name}` : entry.data.name;
      if (hidden.has(this.c(entry.data.name)) || hidden.has(this.c(name))) continue;
      if (typeof this.options.filterCommand === "function" && !this.options.filterCommand(entry, ctx)) {
        continue;
      }

      if (entry.group) {
        const gName = entry.group.data.name;
        if (!seenGroups.has(gName)) {
          seenGroups.add(gName);
          entries.push(`\`${prefix}${gName}\` — ${entry.group.data.description || "..."}`);
        }
      } else {
        entries.push(`\`${prefix}${entry.data.name}\` — ${entry.data.description || "..."}`);
      }
    }

    return entries;
  }

  async sendEmpty(ctx) {
    if (!this.options.useV2) {
      await ctx.send({ embeds: [this.doEmbed(ctx).setDescription(this.labels.welcomeDescription)] });
      return;
    }

    const items = this.#getVisibleCommandEntries(ctx);
    const botName = ctx.bot.user?.username || "Bot";
    const cardColor = this.options.color ?? "Blurple";
    const perPage = Math.max(1, Number(this.options.perPage) || 8);

    if (items.length === 0) {
      const card = ComponentsV2Builder.card({
        color: cardColor,
        title: this.labels.welcomeTitle,
        description: this.labels.welcomeDescription,
        thumbnail: ctx.bot.user?.displayAvatarURL?.(),
        footer: `${botName}${this.labels.footerSuffix}`,
      });
      await ctx.send(card, { ephemeral: this.options.ephemeral });
      return;
    }

    if (this.options.paginated !== false && items.length > perPage) {
      const paginator = new V2Paginator({
        author: ctx.author,
        color: cardColor,
        title: this.labels.welcomeTitle,
        subtitle: this.labels.welcomeDescription,
        thumbnail: ctx.bot.user?.displayAvatarURL?.(),
        items,
        perPage,
        footer: `${botName}${this.labels.footerSuffix}`,
        thirdPartyMode: this.options.thirdPartyMode || "reject",
        closeButton: this.options.closeButton,
      });
      await paginator.send(ctx, { ephemeral: this.options.ephemeral });
      return;
    }

    const list = ComponentsV2Builder.list({
      color: cardColor,
      title: this.labels.welcomeTitle,
      subtitle: this.labels.welcomeDescription,
      thumbnail: ctx.bot.user?.displayAvatarURL?.(),
      items,
      footer: `${botName}${this.labels.footerSuffix}`,
    });
    await ctx.send(list, { ephemeral: this.options.ephemeral });
  }

  async sendNotFound(ctx) {
    if (!this.options.useV2) {
      await ctx.send(this.labels.notFound);
      return;
    }

    const card = ComponentsV2Builder.card({
      color: this.options.errorColor ?? "danger",
      description: this.labels.notFound,
    });
    await ctx.send(card, { ephemeral: this.options.ephemeral ?? true });
  }

  async sendCommand(ctx, command) {
    const cmdName = command.data.aliases?.length
      ? `[${[command.data.name].concat(command.data.aliases).join("|")}]`
      : command.data.name;

    const groupName = command.group
      ? command.group.data.aliases?.length
        ? `[${[command.group.data.name].concat(command.group.data.aliases).join("|")}] `
        : `${command.group.data.name} `
      : "";

    const argsDetails = command.params?.params?.length
      ? command.params.params.map((p) => `**${p.name}**${p.required ? "*" : "?"} :: ${p.description}`).join("\n")
      : null;

    const argsUsage = command.params?.params?.length
      ? command.params.params.map((p) => `${p.name}${p.required ? "*" : "?"}`).join(" ")
      : "";

    const usageStr = `${ctx.prefix}${groupName}${cmdName}${argsUsage ? ` ${argsUsage}` : ""}`.trim();

    if (!this.options.useV2) {
      await ctx.send({
        embeds: [
          this.doEmbed(ctx)
            .setTitle(command.data.name)
            .setDescription(command.data.description)
            .addFields({ name: this.labels.usage, value: usageStr })
            .addFields({ name: this.labels.arguments, value: argsDetails || this.labels.noArguments }),
        ],
      });
      return;
    }

    const botName = ctx.bot.user?.username || "Bot";
    const card = ComponentsV2Builder.card({
      color: this.options.color ?? "Blurple",
      title: `### ${command.data.name}`,
      subtitle: command.data.description,
      thumbnail: ctx.bot.user?.displayAvatarURL?.(),
      fields: [
        [this.labels.usage, `\`${usageStr}\``],
        [this.labels.arguments, argsDetails || this.labels.noArguments],
      ],
      footer: `${botName}${this.labels.footerSuffix}`,
    });
    await ctx.send(card, { ephemeral: this.options.ephemeral });
  }

  async sendGroup(ctx, group) {
    const groupTitle = group.data.aliases?.length
      ? `[${[group.data.name].concat(group.data.aliases).join("|")}] `
      : group.data.name;

    const subList = group.subcommands.map((sub) => `\`${group.data.name} ${sub.data.name}\` :: ${sub.data.description}`);

    if (!this.options.useV2) {
      await ctx.send({
        embeds: [
          this.doEmbed(ctx)
            .setTitle(groupTitle)
            .setDescription(group.data.description)
            .addFields({ name: this.labels.subcommands, value: subList.length ? subList.join("\n") : this.labels.noSubcommands }),
        ],
      });
      return;
    }

    const botName = ctx.bot.user?.username || "Bot";
    const card = ComponentsV2Builder.card({
      color: this.options.color ?? "Blurple",
      title: `### ${groupTitle.trim()}`,
      subtitle: group.data.description,
      thumbnail: ctx.bot.user?.displayAvatarURL?.(),
      sections: [
        {
          heading: this.labels.subcommands,
          text: subList.length ? subList.join("\n") : this.labels.noSubcommands,
        },
      ],
      footer: `${botName}${this.labels.footerSuffix}`,
    });
    await ctx.send(card, { ephemeral: this.options.ephemeral });
  }

  getCommand(ctx, query) {
    const all = ctx.bot.loader.walkCommands();
    const normalized = this.c(query);

    return (
      all.find(
        (cmd) =>
          (!cmd.group && this.c(cmd.data.name) === normalized) ||
          cmd.data.aliases.map((a) => this.c(a)).includes(normalized)
      ) ||
      all
        .filter((cmd) => cmd.group)
        .map((cmd) => ({
          ...cmd,
          regexp: new RegExp(
            `^(${(cmd.group.data.aliases || []).concat(cmd.group.data.name).join("|")})( +)(${(cmd.data.aliases || [])
              .concat(cmd.data.name)
              .join("|")})$`,
            "gi"
          ),
          full: `${cmd.group.data.name} ${cmd.data.name}`,
        }))
        .find((cmd) => cmd.regexp.test(normalized)) ||
      null
    );
  }

  getGroup(ctx, query) {
    const normalized = this.c(query);
    const group = ctx.bot.loader
      .walkCommands()
      .filter((cmd) => cmd.group)
      .map((cmd) => cmd.group)
      .find(
        (grp) => this.c(grp.data.name) === normalized || grp.data.aliases?.map((a) => this.c(a)).includes(normalized)
      );

    if (!group) return null;

    const subcommands = ctx.bot.loader
      .walkCommands()
      .filter((cmd) => cmd.group && cmd.group.data.name === group.data.name)
      .map((cmd) => ({
        ...cmd,
        regexp: new RegExp(
          `^(${(cmd.group.data.aliases || []).concat(cmd.group.data.name).join("|")})( +)(${(cmd.data.aliases || [])
            .concat(cmd.data.name)
            .join("|")})$`,
          "gi"
        ),
        full: `${cmd.group.data.name} ${cmd.data.name}`,
      }));

    return { ...group, subcommands };
  }

  doEmbed(ctx) {
    return new discord_js_1.EmbedBuilder()
      .setAuthor({ name: ctx.author.username, iconURL: ctx.author.displayAvatarURL() })
      .setTimestamp()
      .setColor("Blurple")
      .setFooter({ text: `${ctx.bot.user?.username}${this.labels.footerSuffix}`, iconURL: ctx.bot.user?.displayAvatarURL?.() });
  }

  c(str) {
    return String(str).toLowerCase().trim();
  }
}

exports.HelpCommand = HelpCommand;
