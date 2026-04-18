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
| `GEMINI`      | ✅*       | Primary Google Gemini API key (`*` needed for `/ask`; read by `src/services/ai.service.js`) |
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
├── src/                        # Core infrastructure
│   ├── config/
│   │   ├── env.js              # Env-var validation & typed config object
│   │   ├── constants.js        # Global constants (AI models, prompts, limits)
│   │   ├── bot.config.js       # Gralonium intents & partials
│   │   └── db.config.js        # MongoDB connection settings
│   ├── core/
│   │   ├── logger.js           # Structured logger (levels + timestamps)
│   │   ├── database.js         # MongoDB connection with retry & backoff
│   │   └── bot.js              # Bot factory — wires everything together
│   ├── handlers/
│   │   ├── commandHandler.js   # Prefixed→slash adapter, command loader
│   │   ├── eventHandler.js     # Event file loader & registrar
│   │   ├── readyHandler.js     # clientReady — sync, metadata, contexts
│   │   └── messageHandler.js   # AI follow-up conversation handler
│   ├── resolvers/
│   │   ├── role.resolver.js    # resolveRoleFlexible
│   │   ├── channel.resolver.js # resolveChannelFlexible
│   │   ├── attachment.resolver.js # buildAttachmentFromUrl + resolveAttachmentInput
│   │   └── member.resolver.js  # resolveMemberFlexible
│   ├── cache/
│   │   └── prefix.cache.js     # Prefix cache with TTL + LRU-style eviction
│   ├── state/
│   │   └── commandIds.store.js # Runtime slash-command ID registry
│   ├── utils/
│   │   ├── normalize.js        # normalizeReplyPayload
│   │   ├── parsers.js          # parsePrefixedArgsForSlash
│   │   ├── validators.js       # DISCORD_ID_PATTERN, language tokens
│   │   └── moderation.js       # generateId + parse/formatDuration
│   ├── services/
│   │   ├── ai.service.js       # Gemini generation with timeout/retry/rotation
│   │   ├── memory.service.js   # Conversational memory lifecycle (TTL)
│   │   └── logging.service.js  # Guild moderation log sender
│   ├── middleware/
│   │   └── errorHandler.js     # Graceful shutdown, SIGTERM/SIGINT
│   └── index.js                # Entry point (~30 lines)
│
├── commands/                   # Slash command groups & standalone commands
│   ├── ask.js
│   ├── channel.js / fun.js / mod.js / role.js / server.js / user.js / util.js
│   ├── _shared/thinking.js     # Shared "thinking..." reply helpers
│   └── prefixed/               # Prefixed equivalents (auto-wrapped)
├── events/                     # Gralonium event handlers
├── models/                     # Mongoose models (GuildConfig, Log, Warn, TempBan)
├── utils/                      # Pure shared constants/helpers (colors)
├── config/
│   └── prefixedToSlashMap.js   # Static prefixed→slash name mapping
├── .env.example
└── package.json
```

---

## Adding a new slash command

1. Create (or extend) a file in `commands/` using the existing gralonium command structure.
2. The bot auto-loads all command files via `bot.load("commands")`.
3. If you need a prefixed alias, add a file in `commands/prefixed/` with the same logic
   (or omit it — the adapter will try to match the slash implementation automatically).

## Adding a new event

1. Create a file in `events/` that exports `{ data: { name, code } }`.
2. The event handler picks it up automatically on next restart.

---

## Contributing

Pull requests are welcome. Please keep changes focused and follow the existing module structure.
