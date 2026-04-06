"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.check = exports.cooldown = exports.hasPerms = exports.hasAnyPerms = exports.hasBotPerms = exports.hasAnyBotPerms = exports.isOwner = exports.isNSFW = exports.isInChannelType = exports.isGuild = void 0;

const discord_js_1 = require("discord.js");
const tslib_1 = require("tslib");
const Errors = tslib_1.__importStar(require("./Errors.js"));
const Cooldowns_js_1 = require("./Cooldowns.js");

function isGuild(ctx) {
  if (ctx.channel?.type === discord_js_1.ChannelType.DM) throw new Errors.GuildOnly(ctx);
  return true;
}
exports.isGuild = isGuild;

function isInChannelType(...types) {
  return function (ctx) {
    if (ctx.channel && types.includes(ctx.channel.type)) return true;
    throw new Errors.NotInChannelType(ctx, types, ctx.channel);
  };
}
exports.isInChannelType = isInChannelType;

function isNSFW(ctx) {
  if (!ctx.channel || !("nsfw" in ctx.channel) || !ctx.channel.nsfw) {
    throw new Errors.NotNSFW(ctx);
  }

  return true;
}
exports.isNSFW = isNSFW;

function isOwner(ctx) {
  if (ctx.bot.ops.owners?.includes(ctx.author.id)) return true;
  throw new Errors.NotOwner(ctx);
}
exports.isOwner = isOwner;

function hasAnyBotPerms(...permissions) {
  return function (ctx) {
    if (permissions.some((permission) => ctx.guild?.members.me?.permissions.has(permission))) return true;
    throw new Errors.MissingBotPermission(ctx, permissions);
  };
}
exports.hasAnyBotPerms = hasAnyBotPerms;

function hasBotPerms(...permissions) {
  return function (ctx) {
    if (permissions.every((permission) => ctx.guild?.members.me?.permissions.has(permission))) return true;
    throw new Errors.MissingBotPermission(ctx, permissions);
  };
}
exports.hasBotPerms = hasBotPerms;

function hasAnyPerms(...permissions) {
  return function (ctx) {
    if (permissions.some((permission) => ctx.member?.permissions?.has?.(permission))) return true;
    throw new Errors.MissingPermission(ctx, permissions);
  };
}
exports.hasAnyPerms = hasAnyPerms;

function hasPerms(...permissions) {
  return function (ctx) {
    if (permissions.every((permission) => ctx.member?.permissions?.has?.(permission))) return true;
    throw new Errors.MissingPermission(ctx, permissions);
  };
}
exports.hasPerms = hasPerms;

function cooldown(seconds, bucket) {
  return async function (ctx) {
    let source = "-1";

    switch (bucket) {
      case Cooldowns_js_1.Bucket.Guild:
        source = ctx.guild?.id || "-1";
        break;
      case Cooldowns_js_1.Bucket.Member:
        source = ctx.guild ? `${ctx.guild.id}_${ctx.author.id}` : ctx.author.id;
        break;
      case Cooldowns_js_1.Bucket.User:
        source = ctx.author.id;
        break;
      case Cooldowns_js_1.Bucket.Channel:
        source = ctx.channel?.id || "-1";
        break;
      default:
        source = ctx.author.id;
        break;
    }

    const cooldownInMs = 1000 * seconds;

    const active = await ctx.bot.cooldowns.check(ctx.command.data.name, source, cooldownInMs, bucket);
    if (active) throw new Errors.CommandInCooldown(ctx, active.left);

    await ctx.bot.cooldowns.setCooldownSource(ctx.command.data.name, source, bucket, cooldownInMs);
    return true;
  };
}
exports.cooldown = cooldown;

function check(predicate) {
  return predicate;
}
exports.check = check;
