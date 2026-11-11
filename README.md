# RedBot

A Discord bot built with [discord.js](https://discord.js.org) and [gralonium](https://www.npmjs.com/package/gralonium).

---

## Requirements

- Node.js ≥ 18
- A MongoDB Atlas cluster (or local MongoDB ≥ 6)
- A Discord application with a bot token
- A Google Gemini API key

---

## Project structure

```
RedBot/
├── src/
│   ├── index.js                # entrypoint
│   ├── config.js               # env validation, intents, colors & IDs
│   ├── database.js             # mongoose schemas (GuildConfig, JoinRole, Log, TempBan, Warn, Afk, Reminder)
│   ├── runtime.js              # logger, bot lifecycle, reply & pagination helpers
│   ├── adapter.js              # prefix -> slash argument adapter & snapshot readers
│   ├── guild.js                # prefix, log & AFK caching
│   ├── moderation.js           # warns, durations & persistent tempban scheduler
│   ├── reminders.js            # persistent reminder scheduler & DM delivery
│   ├── ai.js                   # Gemini model rotation, search & scoped memory
│   ├── downloader.js           # video metadata extraction & chunked downloads
│   ├── security.js             # anti-SSRF URL validation, public fetch & bounded body reader
│   └── api.js                  # HTTP stats/commands/health server with rate limiting
│
├── commands/
│   ├── slash/                  # slash command groups & /help (ask, channel, fun, help, mod, role, server, user, util)
│   ├── prefixed/               # prefixed command definitions delegating through adapter.js
│   │   └── catalog.js
│   └── interactions/           # native interaction handlers (autocomplete)
│       └── utilAutocomplete.js
│
├── events/                     # gateway event handlers loaded at startup
│   ├── autoModerationActionExecution.js
│   ├── error.js                # frameworkError handler
│   ├── guildMemberAdd.js       # autorole assigner
│   ├── messageCreate.js        # AFK checks & AI reply continuation
│   └── ready.js                # presence, tempban/reminder restore & command sync
│
├── scripts/
│   └── dev.js                  # dev launcher
├── gralonium/                  # local framework reference
├── .env.example                # environment variables template
└── package.json
```

---

## Adding a new slash command

1. Create (or extend) a file in `commands/slash/` using the Gralonium `CommandBuilder` / `GroupBuilder` structure.
2. `bot.load("commands")` auto-loads all files under `commands/` (including `commands/interactions/`).
3. If you want a prefixed alias, add an entry in `commands/prefixed/catalog.js` (and `PREFIXED_TO_SLASH_MAP` in `src/adapter.js` when names differ), then document it in `commands/slash/help.js`.

Recent additions in this structure include `util poll`, `util remind`, `util ocr`, `channel recap`, `/util translate` language autocomplete, and AutoMod log forwarding.

## Adding a new event

1. Create a file in `events/` that exports `{ data: { name, code } }`.
2. The event handler picks it up automatically on next restart.

---

## Contributing

Pull requests are welcome. Please keep changes focused and follow the existing module structure.
