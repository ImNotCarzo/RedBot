# RedBot

A Discord bot built with [discord.js](https://discord.js.org) and [gralonium](https://www.npmjs.com/package/gralonium).

---

## Requirements

- Node.js ≥ 18
- A MongoDB Atlas cluster (or local MongoDB ≥ 6)
- A Discord application with a bot token
- A Google Gemini API key

---

## Installation

```bash
git clone https://github.com/ImNotCarzo/RedBot.git
cd RedBot
npm install
cp .env.example .env
# fill in .env with your credentials
npm start
```

---

## Environment variables

| Variable      | Required | Description                                                  |
|---------------|----------|--------------------------------------------------------------|
| `TOKEN`       | ✅        | Discord bot token                                            |
| `MONGO`       | ✅        | MongoDB connection URI                                       |
| `CLIENT_ID`   | ✅        | Discord application (client) ID                             |
| `GEMINI`      | ✅*       | Primary Google Gemini API key (`*` needed for `/ask`; read by `src/ai.js`) |
| `GEMINI2`     | ❌        | Second Gemini key — rotated automatically on rate-limit      |
| `OPENROUTER`  | ❌        | OpenRouter API key                                            |
| `GROQ`        | ❌        | Groq API key (used by specific commands)                     |
| `LOG_LEVEL`   | ❌        | `error` \| `warn` \| `info` \| `debug` (default: `info`)    |
| `NODE_ENV`    | ❌        | `development` \| `production` (default: `development`)      |
| `READY_API_TIMEOUT_MS` | ❌ | Timeout (ms) for slash sync/context REST calls (default: `45000`) |
| `READY_RETRY_ATTEMPTS` | ❌ | Retry attempts for startup sync operations (default: `5`) |
| `READY_RETRY_BASE_DELAY_MS` | ❌ | Base exponential backoff delay for sync retries (default: `1500`) |
| `READY_RETRY_MAX_DELAY_MS` | ❌ | Maximum delay cap (ms) for sync retry backoff (default: `30000`) |
| `READY_SYNC_INITIAL_DELAY_MS` | ❌ | Delay before first sync cycle after ready (default: `5000`) |
| `READY_SYNC_INTERVAL_MS` | ❌ | Periodic background re-sync interval (default: `900000`) |
| `ROLE_CONNECTION_TIMEOUT_MS` | ❌ | Timeout (ms) for role-connections metadata update (default: `15000`) |
| `GATEWAY_RECOVERY_GRACE_MS` | ❌ | Grace period before forced restart after gateway/session instability (default: `120000`) |
| `PREFIX_QUERY_TIMEOUT_MS` | ❌ | Timeout (ms) for prefix DB read/update operations (default: `2500`) |

See `.env.example` for a ready-to-copy template.

---

## Running

```bash
# Production
npm start

# Development (debug-level logging)
npm run dev
```

---

## Project structure

```
RedBot/
├── src/                        # Core bot infrastructure (11 clean, modular files)
│   ├── index.js                # Entry point & startup sequence
│   ├── bot.js                  # Gralonium bot factory & dynamic prefix resolver
│   ├── adapter.js              # Prefixed→slash argument adapter & delegation bridge
│   ├── config.js               # Environment validation, bot/db options & AI prompts
│   ├── database.js             # Mongoose connection with backoff retry
│   ├── logger.js               # Structured logger (levels + timestamps)
│   ├── runtime.js              # Event loader, process handlers & graceful shutdown
│   ├── guild.js                # Guild prefix caching, log channel settings & sendLog
│   ├── ai.js                   # Gemini AI generation, rotation & session memory
│   ├── moderation.js           # Warns, duration parser/formatter & tempban scheduler
│   └── commandIds.js           # Discord application command ID registry
│
├── commands/                   # Command definitions
│   ├── slash/                  # Slash command groups & standalone commands
│   │   ├── ask.js              # AI interaction command
│   │   ├── channel.js          # Channel management group
│   │   ├── fun.js              # Persona & entertainment group
│   │   ├── help.js             # Help & command directory
│   │   ├── mod.js              # Moderation suite
│   │   ├── role.js             # Role management group
│   │   ├── server.js           # Server utilities & info
│   │   ├── user.js             # User utilities & profile info
│   │   └── util.js             # Utility tools (ping, translate, transcribe, etc.)
│   ├── prefixed/               # 67 prefixed commands (auto-delegated to slash)
│   └── _shared/                # Shared helpers (pagination, fetch, URLs, replies)
│       ├── runtime.js
│       └── thinking.js
├── events/                     # Gralonium & Discord event listeners
│   ├── error.js                # Centralized frameworkError handler
│   ├── guildMemberAdd.js       # Auto-role assignment on member join
│   ├── messageCreate.js        # Conversational AI replies
│   └── ready.js                # Presence, tempban restore & command sync
├── models/                     # Mongoose schemas (GuildConfig, JoinRole, Log, TempBan, Warn)
├── utils/                      # Color palette constants
│   └── colors.js
├── gralonium/                  # Gralonium framework source
├── .env.example
└── package.json
```

---

## Adding a new slash command

1. Create (or extend) a file in `commands/slash/` using the Gralonium command/group structure.
2. The bot auto-loads all command files via `bot.load("commands")`.
3. If you need a prefixed alias, add a file in `commands/prefixed/` with `as_prefix: true, as_slash: false`. The adapter will match and delegate to the slash implementation automatically.

## Adding a new event

1. Create a file in `events/` that exports `{ data: { name, code } }`.
2. The event handler picks it up automatically on next restart.

---

## Contributing

Pull requests are welcome. Please keep changes focused and follow the existing module structure.
