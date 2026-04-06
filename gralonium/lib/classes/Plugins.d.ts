import { Context } from "./Context.js";
import { ChannelType, PermissionsString } from "discord.js";
import { Bucket } from "./Cooldowns.js";
import { AsyncFunction } from "./Loader.js";
/**
 * Checks if the author is in a guild (Guild Only)
 */
export declare function isGuild(ctx: Context): boolean;
/**
 * Checks if the author is in specified channel types
 * @param types The channel types
 */
export declare function isInChannelType(...types: ChannelType[]): (ctx: Context) => boolean;
/**
 * Checks if the author is in a NSFW channel
 */
export declare function isNSFW(ctx: Context): boolean;
/**
 * Checks if the author is a bot owner
 */
export declare function isOwner(ctx: Context): boolean;
/**
 * Checks if the bot has any of the specified permissions in this guild
 * @param permissions The bot permissions
 */
export declare function hasAnyBotPerms(...permissions: PermissionsString[]): (ctx: Context) => boolean;
/**
 * Checks if the bot has ALL of the specified permissions in this guild
 * @param permissions The required bot permissions
 */
export declare function hasBotPerms(...permissions: PermissionsString[]): (ctx: Context) => boolean;
/**
 * Checks if the author has any of the specified permissions in this guild
 * @param permissions The author permissions
 */
export declare function hasAnyPerms(...permissions: PermissionsString[]): (ctx: Context) => boolean;
/**
 * Checks if the author has ALL of the specified permissions in this guild
 * @param permissions The required author permissions
 */
export declare function hasPerms(...permissions: PermissionsString[]): (ctx: Context) => boolean;
/**
 * Checks if the Bucket has a cooldown in this command
 * @param seconds The cooldown for this command
 * @param bucket The type of object to set the cooldown, ex: Bucket.User, Bucket.Member
 */
export declare function cooldown(seconds: number, bucket: Bucket): (ctx: Context) => Promise<boolean>;
/**
 * Checks a custom condition using an async function
 * @param predicate The async function
 */
export declare function check<T = Context>(predicate: AsyncFunction<T, boolean>): AsyncFunction<T, boolean>;
