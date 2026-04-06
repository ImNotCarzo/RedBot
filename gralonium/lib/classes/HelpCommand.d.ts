import { type Plugin, CommandBuilder, Context, CommandHelpingObject, GroupHelpingObject, ParamsBuilder } from "../main.js";
export declare class HelpCommand {
    data: CommandBuilder;
    plugins: Plugin[];
    params: ParamsBuilder;
    code(ctx: Context): Promise<void>;
    sendEmpty(ctx: Context): Promise<void>;
    sendNotFound(ctx: Context): Promise<void>;
    sendCommand(ctx: Context, command: CommandHelpingObject): Promise<void>;
    sendGroup(ctx: Context, group: GroupHelpingObject): Promise<void>;
    getCommand(ctx: Context, q: string): CommandHelpingObject | null;
    getGroup(ctx: Context, q: string): GroupHelpingObject | null;
    private doEmbed;
    private c;
}
