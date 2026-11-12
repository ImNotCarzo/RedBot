import { EmbedBuilder } from "discord.js";
import type { ColorResolvable } from "./builders/ComponentsV2Builder.js";
import type { CommandBuilder } from "./builders/CommandBuilder.js";
import type { ParamsBuilder } from "./builders/ParamsBuilder.js";
import type { Context } from "./Context.js";
import type { CommandHelpingObject, GroupHelpingObject, Plugin } from "./Loader.js";
import type { V2ViewThirdPartyMode } from "./views/V2View.js";

export interface HelpCommandLabels {
  welcomeTitle?: string;
  welcomeDescription?: string;
  notFound?: string;
  usage?: string;
  arguments?: string;
  noArguments?: string;
  subcommands?: string;
  noSubcommands?: string;
  commandsHeader?: string;
  footerSuffix?: string;
}

export interface HelpCommandOptions {
  useV2?: boolean;
  color?: ColorResolvable;
  errorColor?: ColorResolvable;
  ephemeral?: boolean;
  paginated?: boolean;
  perPage?: number;
  thirdPartyMode?: V2ViewThirdPartyMode;
  closeButton?: boolean | { label?: string; style?: any };
  name?: string;
  aliases?: string[];
  description?: string;
  queryDescription?: string;
  plugins?: Plugin[];
  hiddenCommands?: string[];
  filterCommand?: (command: CommandHelpingObject, ctx: Context) => boolean;
  labels?: HelpCommandLabels;
}

export declare class HelpCommand {
  options: HelpCommandOptions;
  labels: Required<HelpCommandLabels>;
  data: CommandBuilder;
  plugins: Plugin[];
  params: ParamsBuilder;
  constructor(options?: HelpCommandOptions);
  code(ctx: Context): Promise<void>;
  sendEmpty(ctx: Context): Promise<void>;
  sendNotFound(ctx: Context): Promise<void>;
  sendCommand(ctx: Context, command: CommandHelpingObject): Promise<void>;
  sendGroup(ctx: Context, group: GroupHelpingObject): Promise<void>;
  getCommand(ctx: Context, q: string): CommandHelpingObject | null;
  getGroup(ctx: Context, q: string): GroupHelpingObject | null;
  protected doEmbed(ctx: Context): EmbedBuilder;
  protected c(str: string): string;
}
