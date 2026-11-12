import { InteractionCollector, Message, TextBasedChannel, User } from "discord.js";
import type { ColorResolvable, ComponentsV2Builder, V2BuiltPayload, V2ButtonObjectOptions } from "../builders/ComponentsV2Builder.js";
import type { EmojiInput } from "../builders/components/helpers.js";
import type { Context } from "../Context.js";
import type { V2View, V2ViewAttachOptions, V2ViewEndMode, V2ViewSendOptions, V2ViewThirdPartyMode } from "./V2View.js";

export interface V2PaginatorButtonConfig {
  label?: string;
  emoji?: EmojiInput;
  style?: V2ButtonObjectOptions["style"];
}

export interface V2PaginatorPageContext<T = any> {
  page: T;
  pageIndex: number;
  pageNumber: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  items?: T[];
  controls: V2ButtonObjectOptions[];
  view: V2View<{ pageIndex: number }>;
  state: { pageIndex: number };
  isEnded: boolean;
  isEphemeral: boolean;
  prevId: string;
  nextId: string;
  closeId: string;
}

export interface V2PaginatorOptions<T = any> {
  pages?: T[];
  items?: T[];
  perPage?: number;
  totalItems?: number;
  initialPage?: number;
  wrap?: boolean;
  idPrefix?: string;
  author?: User;
  authorId?: string;
  ownerId?: string;
  timeout?: number;
  time?: number;
  timeoutSeconds?: number;
  idle?: number;
  thirdPartyMode?: V2ViewThirdPartyMode;
  thirdPartyMessage?: string;
  onEnd?: V2ViewEndMode;
  onEndHandler?: (info: { view: V2View<{ pageIndex: number }>; message: Message | null; reason: string }) => unknown;
  isEphemeral?: boolean;
  color?: ColorResolvable;
  accentColor?: ColorResolvable;
  title?: string;
  subtitle?: string;
  thumbnail?: string | null;
  numbered?: boolean;
  emptyText?: string;
  footer?: string;
  renderItem?: (item: T, index: number) => string;
  renderPage?: (ctx: V2PaginatorPageContext<T>) => ComponentsV2Builder | V2BuiltPayload;
  appendControlsToPrebuilt?: boolean;
  alwaysShowControls?: boolean;
  outsideControls?: boolean;
  showPageIndicator?: boolean;
  showFirstLast?: boolean;
  pageIndicatorFormatter?: (page: number, totalPages: number) => string;
  prevButton?: V2PaginatorButtonConfig;
  nextButton?: V2PaginatorButtonConfig;
  firstButton?: V2PaginatorButtonConfig;
  lastButton?: V2PaginatorButtonConfig;
  closeButton?: boolean | V2PaginatorButtonConfig;
  closeReason?: string;
}

export declare class V2Paginator<T = any> {
  constructor(options: V2PaginatorOptions<T>);

  readonly view: V2View<{ pageIndex: number }>;
  readonly pageIndex: number;
  readonly totalPages: number;
  readonly collector: InteractionCollector<any> | null;
  readonly message: Message | null;

  toPayload(options?: { ephemeral?: boolean }): V2BuiltPayload;
  attach(message: Message | any, collectorOptions?: V2ViewAttachOptions): InteractionCollector<any>;
  stop(reason?: string): V2View<{ pageIndex: number }>;
  send(
    target: Context | TextBasedChannel,
    sendOptions?: V2ViewSendOptions
  ): Promise<{ view: V2View<{ pageIndex: number }>; message: Message | null; collector: InteractionCollector<any> | null }>;
}
