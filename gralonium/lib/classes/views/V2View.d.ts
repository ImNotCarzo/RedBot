import {
  BaseMessageOptions,
  CollectedInteraction,
  InteractionCollector,
  Message,
  MessageMentionOptions,
  TextBasedChannel,
  User,
} from "discord.js";
import type { ComponentsV2Builder, V2BuiltPayload } from "../builders/ComponentsV2Builder.js";
import type { Context, ContextSendOptions } from "../Context.js";

export type V2ViewThirdPartyMode = "reject" | "allow" | "ephemeral-view";
export type V2ViewEndMode = "disable" | "static" | "delete" | "none";

export interface V2ViewRenderContext<S = Record<string, any>> {
  state: S;
  view: V2View<S>;
  id: (action: string, ...extra: Array<string | number>) => string;
  scopedId: (action: string, ...extra: Array<string | number>) => string;
  ownerId: string | null;
  isEphemeral: boolean;
  isEnded: boolean;
}

export interface V2ViewActionContext<S = Record<string, any>> {
  interaction: CollectedInteraction;
  state: S;
  setState: (updater: Partial<S> | ((prev: S) => S)) => V2View<S>;
  view: V2View<S>;
  action: string;
  subId: string | null;
  parts: string[];
  customId: string;
  values: string[];
  isEphemeral: boolean;
  stop: (reason?: string) => V2View<S>;
  id: (action: string, ...extra: Array<string | number>) => string;
}

export type V2ViewActionHandler<S = Record<string, any>> = (
  ctx: V2ViewActionContext<S>
) => unknown | false | Promise<unknown | false>;

export interface V2ViewOptions<S = Record<string, any>> {
  idPrefix?: string;
  author?: User;
  authorId?: string;
  ownerId?: string;
  state?: S;
  cloneState?: (state: S) => S;
  render?: (ctx: V2ViewRenderContext<S>) => ComponentsV2Builder | V2BuiltPayload;
  renderStatic?: (ctx: V2ViewRenderContext<S>) => ComponentsV2Builder | V2BuiltPayload;
  actions?: Record<string, V2ViewActionHandler<S>>;
  onAction?: V2ViewActionHandler<S>;
  timeout?: number;
  time?: number;
  timeoutSeconds?: number;
  idle?: number;
  thirdPartyMode?: V2ViewThirdPartyMode;
  thirdPartyMessage?: string;
  onEnd?: V2ViewEndMode;
  onEndHandler?: (info: { view: V2View<S>; message: Message | null; reason: string; state: S }) => unknown | Promise<unknown>;
  isEphemeral?: boolean;
  filter?: (interaction: CollectedInteraction, view: V2View<S>) => boolean | Promise<boolean>;
}

export interface V2ViewAttachOptions {
  time?: number;
  idle?: number;
  onError?: (error: unknown, interaction: CollectedInteraction) => void;
}

export type V2ViewSendOptions = ContextSendOptions &
  V2ViewAttachOptions & {
    files?: BaseMessageOptions["files"];
    allowedMentions?: MessageMentionOptions;
  };

export declare class V2View<S = Record<string, any>> {
  constructor(options?: V2ViewOptions<S>);

  readonly idPrefix: string;
  readonly authorId: string | null;
  readonly state: S;
  readonly message: Message | null;
  readonly collector: InteractionCollector<any> | null;
  readonly isEnded: boolean;
  readonly isEphemeral: boolean;

  id(action: string, ...extra: Array<string | number>): string;
  scopedId(action: string, ...extra: Array<string | number>): string;
  setState(updater: Partial<S> | ((prev: S) => S)): this;
  setRenderer(renderFn: (ctx: V2ViewRenderContext<S>) => ComponentsV2Builder | V2BuiltPayload): this;
  on(action: string, handler: V2ViewActionHandler<S>): this;
  action(action: string, handler: V2ViewActionHandler<S>): this;

  toPayload(options?: {
    ephemeral?: boolean;
    static?: boolean;
    isEnded?: boolean;
    safeMentions?: boolean;
    allowedMentions?: MessageMentionOptions;
    files?: BaseMessageOptions["files"];
  }): V2BuiltPayload;

  stop(reason?: string): this;
  attach(message: Message | any, collectorOptions?: V2ViewAttachOptions): InteractionCollector<any>;
  send(
    target: Context | TextBasedChannel,
    sendOptions?: V2ViewSendOptions
  ): Promise<{ view: V2View<S>; message: Message | null; collector: InteractionCollector<any> | null }>;
}
