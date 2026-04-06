import { Channel, ChannelType, Guild, PermissionResolvable, User } from "discord.js";
import { BaseParam, ChannelParam } from "./builders/ParamsBuilder.js";
import { Context } from "./Context.js";
declare class GuildOnly extends Error {
    ctx: Context;
    constructor(context: Context, message?: string);
    get user(): User;
}
declare class NotOwner extends Error {
    ctx: Context;
    constructor(context: Context, message?: string);
    get user(): User;
}
declare class CommandNotFound extends Error {
    ctx: Context;
    provided: string;
    constructor(context: Context, provided: string, message?: string);
}
declare class UnknownCommandError extends Error {
    ctx: Context;
    error: any;
    constructor(context: Context, error: any, message?: string);
}
declare class MissingRequiredParam extends Error {
    ctx: Context;
    param: BaseParam;
    constructor(context: Context, param: BaseParam, message?: string);
}
declare class InvalidParam extends Error {
    ctx: Context;
    metadata: Record<string, any>;
    constructor(context: Context, message?: string, metadata?: Record<string, any>);
}
declare class InvalidParamNumber extends Error {
    ctx: Context;
    param: BaseParam;
    constructor(context: Context, param: BaseParam, message?: string);
}
declare class InvalidParamBoolean extends Error {
    ctx: Context;
    param: BaseParam;
    constructor(context: Context, param: BaseParam, message?: string);
}
declare class InvalidParamChoice extends Error {
    ctx: Context;
    param: BaseParam;
    choices: {
        name: string;
        value: any;
    }[];
    constructor(context: Context, param: BaseParam, choices: {
        name: string;
        value: any;
    }[], message?: string);
}
declare class InvalidParamMember extends Error {
    ctx: Context;
    param: BaseParam;
    constructor(context: Context, param: BaseParam, message?: string);
}
declare class InvalidParamChannel extends Error {
    ctx: Context;
    param: BaseParam;
    constructor(context: Context, param: BaseParam, message?: string);
}
declare class InvalidParamRole extends Error {
    ctx: Context;
    param: BaseParam;
    constructor(context: Context, param: BaseParam, message?: string);
}
declare class InvalidChannelType extends Error {
    ctx: Context;
    param: ChannelParam;
    provided: ChannelType;
    expected: ChannelType[];
    constructor(context: Context, param: ChannelParam, provided: ChannelType, expected: ChannelType[], message?: string);
}
declare class InvalidParamAttachment extends Error {
    ctx: Context;
    param: BaseParam;
    constructor(context: Context, param: BaseParam, message?: string);
}
declare class MissingPermission extends Error {
    ctx: Context;
    permissions: PermissionResolvable[];
    constructor(context: Context, perms: PermissionResolvable[], message?: string);
}
declare class MissingChannelPermission extends Error {
    ctx: Context;
    permissions: PermissionResolvable[];
    channel: Channel;
    constructor(context: Context, perms: PermissionResolvable[], channel: Channel, message?: string);
}
declare class MissingBotPermission extends Error {
    ctx: Context;
    permissions: PermissionResolvable[];
    constructor(context: Context, perms: PermissionResolvable[], message?: string);
}
declare class MissingBotChannelPermission extends Error {
    ctx: Context;
    permissions: PermissionResolvable[];
    channel: Channel;
    constructor(context: Context, perms: PermissionResolvable[], channel: Channel, message?: string);
}
declare class NotNSFW extends Error {
    ctx: Context;
    constructor(context: Context, message?: string);
}
declare class NotInChannelType extends Error {
    ctx: Context;
    types: ChannelType[];
    channel: Channel;
    constructor(ctx: Context, types: ChannelType[], channel: Channel, message?: string);
}
declare class OnlyForIDs extends Error {
    ctx: Context;
    snowflakes: string[];
    constructor(context: Context, snowflakes: string[], message?: string);
}
declare class CommandInCooldown extends Error {
    ctx: Context;
    timeLeft: number;
    constructor(context: Context, timeLeft: number, message?: string);
}
declare class RestrictedUser extends Error {
    ctx: Context;
    user: User;
    constructor(ctx: Context, user: User, message?: string);
}
declare class RestrictedGuild extends Error {
    ctx: Context;
    guild: Guild;
    constructor(ctx: Context, guild: Guild, message?: string);
}
export { InvalidParam, GuildOnly, NotOwner, CommandNotFound, UnknownCommandError, MissingRequiredParam, InvalidParamNumber, InvalidParamChoice, MissingPermission, MissingChannelPermission, MissingBotPermission, MissingBotChannelPermission, InvalidParamBoolean, InvalidParamMember, InvalidParamChannel, InvalidParamRole, InvalidChannelType, InvalidParamAttachment, NotNSFW, NotInChannelType, OnlyForIDs, CommandInCooldown, RestrictedUser, RestrictedGuild };
