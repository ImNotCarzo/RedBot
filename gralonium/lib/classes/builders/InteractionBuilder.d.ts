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
export interface InteractionDataBuilder {
    name?: string;
    type: Interactions;
    description?: string;
}
export declare class InteractionBuilder {
    name?: string;
    type: Interactions;
    description: string;
    constructor(options?: InteractionDataBuilder);
    /**
     * Returns the command data parsed as JSON.
     */
    toJSON(): {
        name: string | undefined;
        description: string;
    };
}
