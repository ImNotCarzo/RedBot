# RedBot

A Discord bot with integrated AI (Gemini), moderation, role management, and utility commands — built with [discord.js](https://discord.js.org) and [erine](https://github.com/ImNotCarzo/erine).

---

## Features

- **AI conversations** powered by Google Gemini (with automatic web-search fallback)
- **Slash & prefixed commands** — the prefixed adapter delegates to the slash implementation automatically
- **Moderation** — ban, kick, mute, tempban, warn, purge, and more
- **Role management** — add, remove, mass-role, hoist, icon, etc.
- **Channel utilities** — lock, unlock, slowmode, nuke, clone, and more
- **Server & user info** embeds
- **Auto-role on join** (`/rolejoin`)
- **Persistent conversation history** per user (10-turn rolling window)
- **Centralized logging** with severity levels and ISO timestamps
- **Graceful shutdown** on `SIGTERM` / `SIGINT`

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
| `GEMINI`      | ✅*       | Primary Google Gemini API key (`*` needed for `/ask`; read by `utils/ai.js`) |
| `GEMINI2`     | ❌        | Second Gemini key — rotated automatically on rate-limit      |
| `GROQ_API_KEY`| ❌        | Groq API key (used by specific commands)                     |
| `LOG_LEVEL`   | ❌        | `error` \| `warn` \| `info` \| `debug` (default: `info`)    |
| `NODE_ENV`    | ❌        | `development` \| `production` (default: `development`)      |

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
│   │   ├── bot.config.js       # Erine intents & partials
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
│   │   ├── member.resolver.js  # resolveMemberFlexible
│   │   ├── role.resolver.js    # resolveRoleFlexible
│   │   ├── channel.resolver.js # resolveChannelFlexible
│   │   └── attachment.resolver.js # buildAttachmentFromUrl + resolveAttachmentInput
│   ├── utils/
│   │   ├── normalize.js        # normalizeReplyPayload
│   │   ├── parsers.js          # parsePrefixedArgsForSlash
│   │   └── validators.js       # DISCORD_ID_PATTERN, language tokens
│   ├── services/
│   │   └── ai.service.js       # Gemini API wrapper (re-exports utils/ai.js)
│   ├── middleware/
│   │   └── errorHandler.js     # Graceful shutdown, SIGTERM/SIGINT
│   └── index.js                # Entry point (~30 lines)
│
├── commands/                   # Slash command groups & standalone commands
│   ├── ask.js
│   ├── channel.js / fun.js / mod.js / role.js / server.js / user.js / util.js
│   └── prefixed/               # Prefixed equivalents (auto-wrapped)
├── events/                     # Erine event handlers
├── models/                     # Mongoose models (GuildConfig, Log, Warn, TempBan)
├── utils/                      # Shared utilities (ai.js, helpers.js, etc.)
├── config/
│   └── prefixedToSlashMap.js   # Static prefixed→slash name mapping
├── .env.example
└── package.json
```

---

## Adding a new slash command

1. Create (or extend) a file in `commands/` using the existing erine command structure.
2. The bot auto-loads all command files via `bot.load("commands")`.
3. If you need a prefixed alias, add a file in `commands/prefixed/` with the same logic
   (or omit it — the adapter will try to match the slash implementation automatically).

## Adding a new event

1. Create a file in `events/` that exports `{ data: { name, code } }`.
2. The event handler picks it up automatically on next restart.

---

## Contributing

Pull requests are welcome. Please keep changes focused and follow the existing module structure.

---

## License

MIT — see [LICENSE](LICENSE).

