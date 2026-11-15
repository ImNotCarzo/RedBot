import {
  ApplicationIntegrationType,
  ButtonStyle,
  ChannelType,
  CommandBuilder,
  ComponentsV2Builder,
  Context,
  Cooldowns,
  Gralonium,
  GraloniumUtils,
  GroupBuilder,
  HelpCommand,
  InteractionBuilder,
  Interactions,
  InteractionContextType,
  ParamsBuilder,
  V2Paginator,
  V2Text,
  V2View,
} from "../lib/main";
import { Confirmator, Paginator, V2Paginator as ExpV2Paginator, V2View as ExpV2View } from "../lib/experiments";

const textPreview = V2Text.join([
  V2Text.heading("Status", 3),
  V2Text.fields([
    ["Ping", V2Text.code("18ms")],
    false,
    ["Empty", undefined],
  ]),
  V2Text.sectionBlock("Details", [["Version", "1.0.0"]]),
  V2Text.quote("Line 1\nLine 2", 120),
  V2Text.subtext("Footer"),
]);

const builder = new ComponentsV2Builder({ color: "#e74c3c" })
  .setColor(0x5865f2)
  .addSection(["### RedBot", "> **Ready**"], {
    thumbnail: "https://example.com/avatar.png",
    fallbackToText: true,
  })
  .addSeparator("small")
  .addFields([["Host", "localhost"]])
  .addSpacer("small")
  .addGallery(["https://example.com/1.png", { url: "https://example.com/2.png", description: "Second" }])
  .addFile(Buffer.from("hello"), { name: "log.txt" })
  .addSmartText(textPreview, { overflow: "file", filename: "out.txt" })
  .addButton({ label: "Docs", url: "https://example.com", emoji: "<:docs:123456789012345678>" })
  .addSelectRow({
    type: "channel",
    customId: "ch_select",
    channelTypes: [ChannelType.GuildText],
    placeholder: "Pick a channel",
  })
  .addUserSelectMenu("u_sel", { minValues: 1, maxValues: 2 })
  .outside()
  .addButton({ label: "Close", customId: "close_btn", style: "danger" })
  .inside({ new: true, color: "success" })
  .addText("Second container");

const payload = builder.toPayload({ ephemeral: true, safeMentions: true });
const _remaining: number = builder.remainingChars;
const _componentsCount: number = builder.componentCount;

const card = ComponentsV2Builder.card({
  title: "Card Title",
  thumbnail: null,
  fields: [["A", "B"]],
  footer: "Footer",
});

const legacySelect = builder
  .addSelectMenu("legacy_id", "Choose")
  .addOption("One", "one", "First", "<:check:123456789012345678>", true)
  .end();

const cmd = new CommandBuilder({
  name: "info",
  description: "Shows info",
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
  nameLocalizations: { "es-ES": "informacion" },
  descriptionLocalizations: { "es-ES": "Muestra información" },
})
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setNameLocalizations({ "en-US": "info" })
  .setDescriptionLocalizations({ "en-US": "Shows info" });

const group = new GroupBuilder({ name: "mod", description: "Moderation" })
  .setIntegrationTypes(0, 1)
  .setContexts(0)
  .setNameLocalizations({ "es-ES": "moderacion" })
  .setDescriptionLocalizations({ "es-ES": "Moderación" });

const inter = new InteractionBuilder({ type: Interactions.UserContextMenu, name: "Info" })
  .setPrefix("ticket:")
  .setMatcher(/^ticket:\d+$/)
  .setGuildOnly(true)
  .setDefaultMemberPermissions(8n)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
  .setNameLocalizations({ "es-ES": "Información" });
const _interCmdJson = inter.toCommandJSON();

const params = new ParamsBuilder()
  .addInteger({ name: "count", description: "Count", minValue: 1, maxValue: 5 })
  .addMentionable({ name: "target", description: "Target" })
  .addUser({ name: "user", description: "User" })
  .toJSON();

ComponentsV2Builder.setDefaultButtonStyle("secondary");
const _defStyle: ButtonStyle = ComponentsV2Builder.getDefaultButtonStyle();

const help = new HelpCommand({
  useV2: true,
  color: "Blurple",
  labels: { notFound: "No encontrado." },
});

const view = new V2View<{ tab: string }>({
  state: { tab: "main" },
  thirdPartyMode: "ephemeral-view",
  onEnd: "disable",
  render: ({ state, id }) =>
    new ComponentsV2Builder().addText(state.tab).addButton({ label: "Switch", customId: id("switch") }),
  actions: {
    switch: ({ setState }) => {
      setState({ tab: "alt" });
    },
  },
});

const paginator = new V2Paginator<string>({
  items: ["a", "b", "c"],
  perPage: 2,
  thirdPartyMode: "ephemeral-view",
  closeButton: true,
});

const legacyPag = Paginator.Buttons({
  next: { label: "Next", style: "success", emoji: "➡️" },
  previous: { label: "Prev", style: "secondary" },
});

const legacyConf = Confirmator.Buttons({
  continue: { label: "Yes", style: "danger" },
  cancel: { label: "No", style: "secondary" },
});

async function useContext(ctx: Context) {
  const _u = ctx.user;
  const _isS = ctx.isSlash;
  const _loc = ctx.locale;
  const _gLoc = ctx.guildLocale;
  await ctx.defer({ ephemeral: true, thinking: true });
  await ctx.send(card);
  await ctx.ephemeral(builder);
  void [_loc, _gLoc];
}

const bot = new Gralonium({
  intents: [],
  prefix: "!",
  replyOnPrefix: true,
  defaultLocale: "en-US",
  localizeCommand: (payload) => payload,
  beforeExecute: async () => true,
  afterExecute: async () => {},
  helpCommand: HelpCommand,
  helpCommandOptions: { useV2: true },
});

bot.loader.setLocalizer((p) => p);
const _resolvedKey: string = Cooldowns.resolveKey(cmd, group);
const _swept: number = bot.cooldowns.sweep();
const _transformed = GraloniumUtils.Utils.transform("1", { name: "x", type: 4, description: "d" }, {} as Context, false, 0);

void [payload, _remaining, _componentsCount, legacySelect, cmd, group, inter, _interCmdJson, params, _defStyle, help, view, paginator, legacyPag, legacyConf, ExpV2View, ExpV2Paginator, useContext, bot, _resolvedKey, _swept, _transformed];
