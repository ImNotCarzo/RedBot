## Install
```bash
npm install gralonium
```

## Features

* Unified command pipeline for prefix and slash commands
* Modular command/event/interaction loaders
* Guards and plugin hooks
* Built-in cooldowns and permission gates
* Centralized framework error events (`frameworkError`)
* Optional debug mode and rate-limit retry for send operations

## Example

```js
const { Gralonium, GatewayIntentBits, Partials } = require("gralonium");

const client = new Gralonium({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel],
  prefix: ".",
  debug: true,
  bindProcessHandlers: true,
  retryOnRateLimit: true
});

await client.load("./files");

client.on("frameworkError", (err, ctx) => {
  console.error(err, ctx?.command?.data?.name);
});

client.login("TOKEN");
```

## Breaking changes
* Client construction now validates required framework/runtime options (`intents`, `prefix`).
* Prefix parsing now resolves routing first and then parses args from raw message content, improving quote/space fidelity.
* Component utilities (`Paginator`, `Confirmator`) now require `setMessage()` and use message-scoped collectors.
* `Context#send()` now blocks autocomplete replies and supports optional bounded retry for 429 responses.

## Migration notes

* Prefer `const { Gralonium } = require("gralonium")`.
* Ensure your client options always include `intents` and `prefix`.
* If you use `Paginator`/`Confirmator`, always call `.setMessage(sentMessage)` before `.start()`.
* Use `retryOnRateLimit: true` only when you want bounded automatic retries for send operations.

## Notes

* Unified execution for slash and prefix command handlers is implemented in `Utils.executeCommand()`.
* Use `frameworkError` to centralize framework/runtime errors.

## Disclaimer

Not affiliated with Discord or discord.js.
