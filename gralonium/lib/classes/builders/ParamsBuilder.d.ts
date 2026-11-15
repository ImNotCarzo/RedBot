import { ApplicationCommandOptionType, ChannelType } from "discord.js";
import type { LocalizationMap } from "./CommandBuilder.js";

export interface ParamChoice<V = string | number> {
  name: string;
  value: V;
  name_localizations?: LocalizationMap;
  nameLocalizations?: LocalizationMap;
}

export interface BaseParam {
  /** The name for this parameter. */
  name: string;
  /** The description for this parameter. */
  description: string;
  /** Mark this param as required or not. */
  required?: boolean;
  /** Localized option names. */
  name_localizations?: LocalizationMap;
  nameLocalizations?: LocalizationMap;
  /** Localized option descriptions. */
  description_localizations?: LocalizationMap;
  descriptionLocalizations?: LocalizationMap;
  /** Parameter type. (if needed) */
  type?: ApplicationCommandOptionType;
  /** Parameter default value. */
  value?: any;
  /** Mostly to be used for string. Return all arguments after this parameter (including this one) */
  ellipsis?: boolean;
}

export interface StringParam extends BaseParam {
  /** String choices. */
  choices?: ParamChoice<string>[];
  /** Maximum string length. */
  max_length?: number;
  maxLength?: number;
  /** Minimum string length. */
  min_length?: number;
  minLength?: number;
  /** Mark this command as autocomplete. */
  autocomplete?: boolean;
}

export interface NumberParam extends BaseParam {
  /** Maximum number value. */
  max_value?: number;
  maxValue?: number;
  /** Minimum number value. */
  min_value?: number;
  minValue?: number;
  /** Number choices. */
  choices?: ParamChoice<number | string>[];
  autocomplete?: boolean;
}

export interface IntegerParam extends BaseParam {
  /** Maximum integer value. */
  max_value?: number;
  maxValue?: number;
  /** Minimum integer value. */
  min_value?: number;
  minValue?: number;
  /** Integer choices. */
  choices?: ParamChoice<number | string>[];
  autocomplete?: boolean;
}

export interface ChannelParam extends BaseParam {
  /** An array of allowed channel types. */
  channel_types?: ChannelType[];
  channelTypes?: ChannelType[];
}

export type MentionableParam = BaseParam;

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
   */
  addString(param: StringParam): ParamsBuilder;
  /**
   * Adds a number option.
   */
  addNumber(param: NumberParam): ParamsBuilder;
  /**
   * Adds an integer option.
   */
  addInteger(param: IntegerParam): ParamsBuilder;
  /**
   * Adds a boolean option.
   */
  addBoolean(param: BaseParam): ParamsBuilder;
  /**
   * Adds a guild member / user option.
   */
  addMember(param: BaseParam): ParamsBuilder;
  /**
   * Alias of `addMember`.
   */
  addUser(param: BaseParam): ParamsBuilder;
  /**
   * Adds a guild channel option.
   */
  addChannel(param: ChannelParam): ParamsBuilder;
  /**
   * Adds a role option.
   */
  addRole(param: BaseParam): ParamsBuilder;
  /**
   * Adds an attachment option.
   */
  addAttachment(param: BaseParam): ParamsBuilder;
  /**
   * Adds a mentionable (user or role) option.
   */
  addMentionable(param: MentionableParam): ParamsBuilder;
  /**
   * Serializes options cleanly for Discord ApplicationCommand registration.
   */
  toJSON(): Record<string, any>[];
}
