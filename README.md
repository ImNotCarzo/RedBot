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
│   ├── index.js                # startup
│   ├── bot.js                  # prefix resolver
│   ├── adapter.js              # adapters prefix -> slash
│   ├── config.js               # validations
│   ├── database.js             # mongoy db
│   ├── logger.js               # levels, timestamps...
│   ├── runtime.js              # loader and handlers
│   ├── guild.js                # prefix caching, logs and more data
│   ├── ai.js                   # rotation, ai memory
│   ├── moderation.js           # schedules
│   └── commandIds.js           # IDs for help command
│
├── commands/                   
│   ├── slash/                  # slash command groups (code here)
│   │   ├── ask.js              
│   │   ├── channel.js          
│   │   ├── help.js             
│   │   ├── mod.js              
│   │   ├── role.js             
│   │   ├── server.js           
│   │   ├── user.js             
│   │   └── util.js             
│   ├── prefixed/               # carcases for prefix commands, no code needed there.
│   └── _shared/                # helpers (pagination, fetch, URLs, replies)
│       ├── runtime.js
│       └── thinking.js
├── events/                     
│   ├── error.js                # frameworkError handler
│   ├── guildMemberAdd.js       # autorole asigner
│   ├── messageCreate.js        # ai memory for conversations
│   └── ready.js                # presence, tempban restore & command sync
├── models/                     # mongoose schemas (GuildConfig, JoinRole, Log, TempBan, Warn)
├── utils/                      
│   └── colors.js
├── gralonium/                  # just for reference
├── .env                        # fill it with your keys
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
