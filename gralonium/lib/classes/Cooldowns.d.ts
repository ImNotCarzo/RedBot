import { Erine } from "./Client";
import { Collection } from "discord.js";
export declare enum Bucket {
    Member = "MEMBER",
    User = "USER",
    Guild = "GUILD",
    Channel = "CHANNEL"
}
export declare class Cooldowns {
    bot: Erine;
    track: Collection<string, {
        startedAt: number;
        expiresAt: number;
    }>;
    constructor(bot: Erine);
    getCooldownSource(command: string, id: string, bucket: Bucket): Promise<number | undefined>;
    setCooldownSource(command: string, id: string, bucket: Bucket, time: number): Promise<void>;
    check(command: string, id: string, cooldown: number, bucket: Bucket): Promise<{
        command: string;
        id: string;
        time: number;
        bucket: Bucket;
        left: number;
    } | null>;
}
