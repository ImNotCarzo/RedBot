import { ApplicationCommandOptionType, ChannelType } from "discord.js";
export interface BaseParam {
    /** The name for this parameter. */
    name: string;
    /** The description for this parameter. */
    description: string;
    /** Mark this param as required or not. */
    required: boolean;
    /** Parameter type. (if needed) */
    type?: ApplicationCommandOptionType;
    /** Parameter default value. */
    value?: any;
    /** Mostly to be used for string. Return all arguments after this parameter (including this one) */
    ellipsis?: boolean;
}
export interface StringParam extends BaseParam {
    /** String choices. */
    choices?: {
        name: string;
        value: string;
    }[];
    /** Maximum string length. */
    max_length?: number;
    /** Minimum string length. */
    min_length?: number;
    /** Mark this command as automplete */
    autocomplete?: boolean;
}
export interface NumberParam extends BaseParam {
    /** Maximum number length. */
    max_value?: number;
    /** Minimum string length. */
    min_value?: number;
    /** Number choices. */
    choices?: {
        name: string;
        value: string;
    }[];
}
export interface ChannelParam extends BaseParam {
    /** An array of allowed channel types. */
    channel_types?: ChannelType[];
}
export declare class ParamsBuilder {
    params: BaseParam[];
    quoted: boolean;
    /**
     * Enable or disable quoted arguments.
     * @param value Boolean value.
     */
    setQuoted(value: boolean): ParamsBuilder;
    /**
     * Adds a string option.
     * @param param Parameter data.
     */
    addString(param: StringParam): ParamsBuilder;
    /**
     * Adds a number option.
     * @param param Parameter data.
     */
    addNumber(param: NumberParam): ParamsBuilder;
    /**
     * Adds a boolean option.
     * @param param Parameter data.
     */
    addBoolean(param: BaseParam): ParamsBuilder;
    /**
     * Adds a guild member option.
     * @param param Parameter data.
     */
    addMember(param: BaseParam): ParamsBuilder;
    /**
     * Adds a guild channel option.
     * @param param Parameter data.
     */
    addChannel(param: ChannelParam): ParamsBuilder;
    /**
     * Adds a role option.
     * @param param Parameter data.
     */
    addRole(param: BaseParam): ParamsBuilder;
    /**
     * Adds an attachment option.
     * @param param Parameter data.
     */
    addAttachment(param: BaseParam): ParamsBuilder;
}
