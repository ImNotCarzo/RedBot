import {
  ActionRowBuilder,
  AttachmentBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  Message,
  MessageMentionOptions,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import type { DisableComponentsOptions, EmojiInput, ParsedEmoji } from "./components/helpers";
import type { V2CardOptions, V2ConfirmOptions, V2ImageViewOptions, V2ListOptions } from "./components/templates";
import { V2Text, type V2FieldRow } from "./components/text";

export type ButtonStyleResolvable =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "link"
  | "premium"
  | ButtonStyle
  | number;

export type ColorResolvable = string | number | [number, number, number] | null;

export type SeparatorSpacingResolvable = "small" | "large" | SeparatorSpacingSize;

export type V2SectionFieldRow = V2FieldRow;

export interface ComponentsV2BuilderOptions {
  color?: ColorResolvable;
  accentColor?: ColorResolvable;
  spoiler?: boolean;
  safeMentions?: boolean;
}

export interface V2TextOptions {
  ignoreEmpty?: boolean;
  maxLength?: number;
  joinWith?: string;
}

export interface V2FieldsOptions extends V2TextOptions {
  omitEmpty?: boolean;
  omitIfEmpty?: boolean;
  fallback?: string;
}

export interface V2SectionBlockOptions extends V2FieldsOptions {
  separator?: boolean | "small" | "large";
}

export interface V2QuoteOptions {
  ignoreEmpty?: boolean;
  maxLength?: number;
  fallback?: string;
}

export interface V2SmartTextOptions {
  overflow?: "file" | "clip" | "split";
  maxLength?: number;
  limit?: number;
  filename?: string;
  fileDescription?: string;
  spoiler?: boolean;
  preview?: boolean;
  previewLimit?: number;
  overflowNotice?: string;
  codeBlock?: string;
  chunkSize?: number;
  fallbackToFile?: boolean;
  ignoreEmpty?: boolean;
}

export interface V2ButtonObjectOptions {
  label?: string;
  customId?: string;
  id?: string;
  style?: ButtonStyleResolvable;
  url?: string;
  emoji?: EmojiInput;
  disabled?: boolean;
  skuId?: string;
}

export type V2ButtonTuple = [
  label: string,
  customId?: string | null,
  style?: ButtonStyleResolvable,
  url?: string,
  extra?: Partial<V2ButtonObjectOptions>
];

export type V2ButtonInput = ButtonBuilder | V2ButtonObjectOptions | V2ButtonTuple;

export interface V2SectionOptions extends V2TextOptions {
  thumbnail?: string | ThumbnailBuilder | { url?: string | null; description?: string; spoiler?: boolean } | null;
  thumbnailDescription?: string;
  thumbnailSpoiler?: boolean;
  button?: ButtonBuilder | V2ButtonObjectOptions;
  fallbackToText?: boolean;
}

export interface V2GalleryItemObject {
  url: string;
  description?: string;
  spoiler?: boolean;
}

export type V2GalleryEntry = string | MediaGalleryItemBuilder | V2GalleryItemObject | null | undefined | false;
export type V2GalleryInput = MediaGalleryBuilder | V2GalleryEntry | V2GalleryEntry[];

export interface V2GalleryOptions {
  description?: string;
  spoiler?: boolean;
  ignoreEmpty?: boolean;
  ignoreInvalid?: boolean;
  autoSplit?: boolean;
}

export interface V2AttachmentOptions {
  name?: string;
  description?: string;
}

export interface V2FileOptions extends V2AttachmentOptions {
  spoiler?: boolean;
  attachment?: Buffer | Uint8Array | string | AttachmentBuilder;
}

export interface V2FileInput {
  source: Buffer | Uint8Array | string | AttachmentBuilder;
  name?: string;
  description?: string;
  spoiler?: boolean;
}

export interface V2StringSelectOption {
  label: string;
  value?: string;
  description?: string;
  emoji?: EmojiInput;
  default?: boolean;
}

export type V2SelectOptionTuple = [
  label: string,
  value?: string,
  description?: string,
  emoji?: EmojiInput,
  isDefault?: boolean
];

export interface V2SelectMenuConfig {
  type?: "string" | "user" | "role" | "channel" | "mentionable";
  customId?: string;
  id?: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
  options?: Array<V2StringSelectOption | V2SelectOptionTuple | StringSelectMenuOptionBuilder>;
  channelTypes?: ChannelType[];
  defaultValues?: Array<string | { id: string; type: number }>;
  defaultUsers?: string[];
  defaultRoles?: string[];
  defaultChannels?: string[];
}

export interface V2PayloadOptions {
  ephemeral?: boolean;
  suppressNotifications?: boolean;
  flags?: number;
  safeMentions?: boolean;
  allowedMentions?: MessageMentionOptions;
  files?: BaseMessageOptions["files"];
}

export interface V2BuiltPayload {
  components: TopLevelV2Component[];
  flags: number;
  files?: Array<AttachmentBuilder | NonNullable<BaseMessageOptions["files"]>[number]>;
  allowedMentions?: MessageMentionOptions;
}

export type TopLevelV2Component =
  | ContainerBuilder
  | SectionBuilder
  | TextDisplayBuilder
  | SeparatorBuilder
  | MediaGalleryBuilder
  | FileBuilder
  | ActionRowBuilder<any>;

export declare class SelectMenuProxy {
  addOption(option: V2StringSelectOption | StringSelectMenuOptionBuilder): this;
  addOption(label: string, value: string, description?: string, emoji?: EmojiInput, isDefault?: boolean): this;
  addOptions(options: Array<V2StringSelectOption | V2SelectOptionTuple | StringSelectMenuOptionBuilder | false | null | undefined>): this;
  setPlaceholder(placeholder: string): this;
  setMinValues(min: number): this;
  setMaxValues(max: number): this;
  setDisabled(disabled?: boolean): this;
  end(): ComponentsV2Builder;
}

export declare class ComponentsV2Builder {
  static readonly flags: number;
  static readonly MAX_TEXT_LENGTH: number;
  static readonly SAFE_TEXT_LENGTH: number;
  static readonly MAX_COMPONENTS: number;
  static readonly MAX_TOP_LEVEL_COMPONENTS: number;
  static readonly text: typeof V2Text;
  static clipText(text: string, maxLen?: number, fallback?: string): string;
  static resolveColor(color?: ColorResolvable, fallback?: ColorResolvable): number | null;
  static parseEmoji(emoji?: EmojiInput): ParsedEmoji | null;
  static isValidMediaUrl(url?: string | null): boolean;
  static isValidLinkUrl(url?: string | null): boolean;
  static disableComponents(components: any[], options?: DisableComponentsOptions): any[];
  static disableMessageComponents(message: Message, options?: DisableComponentsOptions): Promise<Message | null>;
  static countTextLength(components: any[]): number;
  static countComponents(components: any[]): number;
  static isBuilder(value: unknown): value is ComponentsV2Builder;

  constructor(options?: ComponentsV2BuilderOptions);

  setColor(color: ColorResolvable): this;
  setAccentColor(color: ColorResolvable): this;
  setSpoiler(spoiler?: boolean): this;
  addContainer(options?: ComponentsV2BuilderOptions): this;
  outside(): this;
  inside(options?: ComponentsV2BuilderOptions & { new?: boolean; newContainer?: boolean }): this;

  addText(content: string | TextDisplayBuilder | Array<string | TextDisplayBuilder | false | null | undefined>, options?: V2TextOptions): this;
  addFields(rows: Array<V2FieldRow | false | null | undefined>, options?: V2FieldsOptions): this;
  addSectionBlock(heading: string, rows: Array<V2FieldRow | false | null | undefined>, options?: V2SectionBlockOptions): this;
  addQuote(text: string, options?: V2QuoteOptions): this;
  addSmartText(text: string, options?: V2SmartTextOptions): this;

  addSection(
    texts: string | TextDisplayBuilder | Array<string | TextDisplayBuilder | false | null | undefined>,
    accessoryOrOptions?: ThumbnailBuilder | ButtonBuilder | V2SectionOptions
  ): this;

  addGallery(itemsOrUrl: V2GalleryInput, options?: V2GalleryOptions): this;
  addAttachment(source: Buffer | Uint8Array | string | AttachmentBuilder, options?: V2AttachmentOptions): this;
  addFile(source: Buffer | Uint8Array | string | AttachmentBuilder | FileBuilder, options?: V2FileOptions): this;

  addSeparator(spacing?: SeparatorSpacingResolvable | { spacing?: SeparatorSpacingResolvable; divider?: boolean }, divider?: boolean): this;
  addSpacer(spacing?: SeparatorSpacingResolvable): this;

  addButton(options: V2ButtonObjectOptions | ButtonBuilder): this;
  addButton(label: string, customId?: string | null, style?: ButtonStyleResolvable, url?: string, extraOptions?: Partial<V2ButtonObjectOptions>): this;
  addButtons(buttons: Array<V2ButtonInput | false | null | undefined>, options?: { autoWrap?: boolean }): this;
  addButtonsRow(buttons: Array<V2ButtonInput | false | null | undefined>, options?: { autoWrap?: boolean }): this;

  addSelectMenu(config: V2SelectMenuConfig): this;
  addSelectMenu(customId: string, placeholder?: string): SelectMenuProxy;
  addSelectRow(config: V2SelectMenuConfig): this;
  addUserSelectMenu(configOrCustomId: string | Omit<V2SelectMenuConfig, "type">, options?: Omit<V2SelectMenuConfig, "type" | "customId">): this;
  addRoleSelectMenu(configOrCustomId: string | Omit<V2SelectMenuConfig, "type">, options?: Omit<V2SelectMenuConfig, "type" | "customId">): this;
  addChannelSelectMenu(configOrCustomId: string | Omit<V2SelectMenuConfig, "type">, options?: Omit<V2SelectMenuConfig, "type" | "customId">): this;
  addMentionableSelectMenu(configOrCustomId: string | Omit<V2SelectMenuConfig, "type">, options?: Omit<V2SelectMenuConfig, "type" | "customId">): this;

  addComponent(component: TopLevelV2Component): this;

  readonly textLength: number;
  readonly remainingChars: number;
  readonly componentCount: number;
  readonly remainingComponents: number;
  readonly files: AttachmentBuilder[];

  build(): TopLevelV2Component[];
  toJSON(): Record<string, unknown>[];
  toPayload(options?: V2PayloadOptions): V2BuiltPayload;

  static card(options?: V2CardOptions): ComponentsV2Builder;
  static imageView(options?: V2ImageViewOptions): ComponentsV2Builder;
  static list<T = unknown>(options?: V2ListOptions<T>): ComponentsV2Builder;
  static confirm(options: V2ConfirmOptions): ComponentsV2Builder;
  static confirm(confirmId: string, cancelId: string, title?: string, message?: string): ComponentsV2Builder;
  static createConfirm(options: V2ConfirmOptions): ComponentsV2Builder;
  static createConfirm(confirmId: string, cancelId: string, title?: string, message?: string): ComponentsV2Builder;
  static createTicketMenu(customId: string, title?: string, description?: string): { builder: ComponentsV2Builder; select: SelectMenuProxy };
  static createPlanSelector(customId: string, title?: string, description?: string): { builder: ComponentsV2Builder; select: SelectMenuProxy };
  static createRoleMenu(customId: string, title?: string, description?: string): { builder: ComponentsV2Builder; select: SelectMenuProxy };
}
