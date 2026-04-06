import { ClientEvents } from "discord.js";
export interface EventDataBuilder {
    name: keyof ClientEvents;
    once: boolean;
    description?: string;
}
export declare class EventBuilder {
    name: string;
    once: boolean;
    description: string;
    constructor(options?: EventDataBuilder);
    /**
     * Returns the command data parsed as JSON.
     */
    toJSON(): {
        name: string;
        description: string;
    };
}
