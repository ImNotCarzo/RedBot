export declare enum Interactions {
  AnyInteraction = "anyInteraction",
  Autocomplete = "autocomplete",
  Button = "button",
  ChatInput = "chatInput",
  MessageContextMenu = "messageContextMenu",
  Modal = "modalSubmit",
  UserContextMenu = "userContextMenu",
  ChannelSelectMenu = "channelSelectMenu",
  RoleSelectMenu = "roleSelectMenu",
  StringSelectMenu = "stringSelectMenu",
  UserSelectMenu = "userSelectMenu",
  MentionableSelectMenu = "mentionableSelectMenu"
}

export type InteractionMatcher = RegExp | ((key: string, interaction: any) => boolean);

export interface InteractionDataBuilder {
  name?: string;
  type: Interactions;
  description?: string;
  prefix?: string;
  match?: InteractionMatcher;
}

export declare class InteractionBuilder {
  name?: string;
  type: Interactions;
  description: string;
  prefix?: string;
  match?: InteractionMatcher;
  constructor(options?: InteractionDataBuilder);
  setName(name: string): this;
  setDescription(description: string): this;
  setPrefix(prefix: string): this;
  setMatcher(matcher: InteractionMatcher): this;
  hasPattern(): boolean;
  matches(key: string, interaction?: any): boolean;
  /**
   * Returns the interaction data parsed as JSON.
   */
  toJSON(): {
    name: string | undefined;
    description: string;
    prefix?: string;
  };
}
