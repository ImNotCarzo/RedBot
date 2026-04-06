# 🤖 Gralonium - Discord.js Framework

Un framework modular y poderoso para crear bots de Discord con soporte unificado para comandos prefix y slash, eventos, interacciones y un completo sistema de validaciones.

## 📦 Install

```bash
npm install gralonium
```

### Requisitos
- Node.js >= 18.0.0
- discord.js ^14.0.0

## ✨ Features

* ⚡ **Unified command pipeline** - Mismo código para prefix y slash commands
* 🎯 **Modular loaders** - Auto-carga de comandos, eventos e interacciones
* 🛡️ **Guards y plugins** - Sistema de validaciones integrado
* ⏱️ **Cooldowns inteligentes** - Por usuario, miembro, servidor o canal
* 🚨 **Centralizado error handling** - Evento `frameworkError` para manejo de errores
* 🔐 **Permission gates** - Permisos de usuario y bot integrados
* 🐛 **Debug mode** - Modo debug opcional y reintentos en rate-limit
* 📝 **Parámetros tipados** - String, Number, Boolean, Member, Role, Channel, Attachment

---

## 🚀 Quick Start

### 1. Main File (index.js)

```javascript
const { Gralonium, GatewayIntentBits, Partials } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");

// ═══════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════

const client = new Gralonium({
  // Discord.js options
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],

  // Framework options
  prefix: ".",                    // Prefix del bot (o array: [".", "!"])
  guildOnly: false,               // Solo funciona en servidores
  owners: ["YOUR_USER_ID"],       // IDs de dueños del bot
  debug: true,                    // Modo debug (muestra logs)
  autoSync: true,                 // Sync automático de slash commands
  bindProcessHandlers: true,      // Manejo automático de procesos
  retryOnRateLimit: true,         // Reintentar si rate limited
  replyOnEdit: true,              // Responder a mensajes editados
});

// ═══════════════════════════════════════════════════
// EVENTOS DEL FRAMEWORK
// ═══════════════════════════════════════════════════

// Evento cuando el bot está listo
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  console.log(`📊 Servidores: ${client.guilds.cache.size}`);
  client.user.setActivity("con los comandos", { type: "PLAYING" });
});

// Evento centralizado de errores del framework
client.on("frameworkError", (err, ctx) => {
  const RED = "#ff383d";
  
  console.error("❌ Error del framework:", err.name);
  console.error("Comando:", ctx?.command?.data?.name);
  console.error("Mensaje original:", err.message);

  // Manejo específico de errores
  if (err.name === "GuildOnly") {
    ctx?.send({
      content: "❌ Este comando solo funciona en servidores",
      flags: MessageFlags.Ephemeral,
    });
  } 
  else if (err.name === "NotOwner") {
    ctx?.send({
      content: "❌ Solo los dueños del bot pueden usar este comando",
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "CommandNotFound") {
    console.log(`⚠️ Comando no encontrado: ${err.provided}`);
  }
  else if (err.name === "MissingRequiredParam") {
    ctx?.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Parámetro faltante")
          .setDescription(`Necesitas proporcionar: **${err.param.name}**`)
          .setColor(RED),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "MissingPermission") {
    ctx?.send({
      content: `❌ Necesitas estos permisos: ${err.permissions.join(", ")}`,
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "MissingBotPermission") {
    ctx?.send({
      content: `❌ Necesito estos permisos: ${err.permissions.join(", ")}`,
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "CommandInCooldown") {
    ctx?.send({
      content: `⏰ Este comando está en cooldown. Espera **${Math.ceil(err.timeLeft / 1000)}s**`,
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "InvalidParamMember") {
    ctx?.send({
      content: `❌ No encontré el usuario que especificaste`,
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "InvalidParamChannel") {
    ctx?.send({
      content: `❌ No encontré el canal que especificaste`,
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "InvalidParamRole") {
    ctx?.send({
      content: `❌ No encontré el rol que especificaste`,
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "InvalidParamNumber") {
    ctx?.send({
      content: `❌ El número debe estar entre ${err.param.min_value} y ${err.param.max_value}`,
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "InvalidParamChoice") {
    const opciones = err.choices.map(c => `\`${c.name}\``).join(", ");
    ctx?.send({
      content: `❌ Elige una de estas opciones: ${opciones}`,
      flags: MessageFlags.Ephemeral,
    });
  }
  else if (err.name === "RestrictedUser") {
    console.log(`🚫 Usuario bloqueado: ${err.user.tag}`);
  }
  else if (err.name === "RestrictedGuild") {
    console.log(`🚫 Servidor bloqueado: ${err.guild.name}`);
  }
  else {
    // Error desconocido
    ctx?.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ Error inesperado")
          .setDescription("Algo salió mal. Por favor intenta más tarde.")
          .setColor(RED),
      ],
      flags: MessageFlags.Ephemeral,
    });
    console.error(err);
  }
});

// ═══════════════════════════════════════════════════
// AUTO-LOAD DE ARCHIVOS
// ═══════════════════════════════════════════════════

(async () => {
  try {
    await client.load("./files");
    console.log("✅ Archivos cargados correctamente");
  } catch (err) {
    console.error("❌ Error al cargar archivos:", err);
  }

  // Conectar el bot
  client.login(process.env.TOKEN || "YOUR_TOKEN_HERE");
})();

// ═══════════════════════════════════════════════════
// MANEJO DE PROCESOS
// ═══════════════════════════════════════════════════

process.on("unhandledRejection", (err) => {
  console.error("❌ Promise rechazada sin manejar:", err);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Exception no capturada:", err);
  process.exit(1);
});
```

---

## 📂 Estructura de Carpetas

```
proyecto/
├── files/
│   ├── commands/
│   │   ├── util/
│   │   │   ├── ping.js
│   │   │   ├── avatar.js
│   │   │   └── botinfo.js
│   │   ├── mod/
│   │   │   ├── kick.js
│   │   │   ├── ban.js
│   │   │   └── warn.js
│   │   ├── config/
│   │   │   ├── set.js
│   │   │   └── get.js
│   │   └── group.js          (GroupBuilder)
│   ├── events/
│   │   ├── ready.js
│   │   ├── messageCreate.js
│   │   ├── guildMemberAdd.js
│   │   └── interactionCreate.js
│   └── interactions/
│       ├── buttons.js
│       └── modals.js
├── index.js                   (main file)
├── package.json
├── .env
└── .gitignore
```

---

## 🎯 Ejemplos de Comandos

### Comando Simple

```javascript
const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");

const RED = "#ff383d";

module.exports = {
  data: new CommandBuilder({
    name: "ping",
    description: "Muestra la latencia del bot",
    as_prefix: true,
    as_slash: true,
  }),

  params: new ParamsBuilder(),

  async code(ctx) {
    try {
      const before = Date.now();
      const sent = await ctx.send("🔄 Calculando latencia...");
      const msgPing = Date.now() - before;
      const apiPing = ctx.bot?.ws?.ping ?? 0;

      await sent.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏓 Pong!")
            .setDescription(
              `> **Mensaje:** \`${msgPing}ms\`\n` +
              `> **API:** \`${apiPing}ms\``
            )
            .setColor(RED),
        ],
      });
    } catch (err) {
      console.error("[ping]", err);
      await ctx.send({
        content: "❌ Algo salió mal",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
```

### Comando con Parámetros y Guards

```javascript
const { CommandBuilder, ParamsBuilder, Plugins, Bucket } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");

const RED = "#ff383d";

module.exports = {
  data: new CommandBuilder({
    name: "kick",
    aliases: ["expulsar"],
    description: "Expulsa a un usuario del servidor",
    as_prefix: true,
    as_slash: true,
    guards: [
      Plugins.isGuild,                          // Solo en servidores
      Plugins.hasPerms("KickMembers"),         // Usuario tiene perms
      Plugins.hasBotPerms("KickMembers"),      // Bot tiene perms
      Plugins.cooldown(5, Bucket.User),        // 5s cooldown
    ],
  }),

  params: new ParamsBuilder()
    .addMember({
      name: "usuario",
      description: "Usuario a expulsar",
      required: true,
    })
    .addString({
      name: "razon",
      description: "Razón de la expulsión",
      required: false,
      max_length: 100,
    }),

  async code(ctx) {
    try {
      const targetMember = ctx.get("usuario");
      const reason = ctx.get("razon") || "No especificada";

      // Validaciones
      if (targetMember.user.bot) {
        return ctx.send({
          content: "❌ No puedo expulsar bots",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (targetMember.user.id === ctx.author.id) {
        return ctx.send({
          content: "❌ No puedes expulsarte a ti mismo",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!targetMember.kickable) {
        return ctx.send({
          content: "❌ No tengo permisos para expulsar a este usuario",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Acción
      await targetMember.kick(`Razón: ${reason}`);

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Usuario expulsado")
            .setFields(
              { name: "Usuario", value: `\`${targetMember.user.tag}\`` },
              { name: "Razón", value: `\`${reason}\`` },
              { name: "Moderador", value: `\`${ctx.author.tag}\`` }
            )
            .setColor(RED)
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error("[kick]", err);
      await ctx.send({
        content: "❌ Error al expulsar al usuario",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
```

### Comando con Choices

```javascript
const { CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");

const RED = "#ff383d";

module.exports = {
  data: new CommandBuilder({
    name: "weather",
    description: "Muestra el clima de una ciudad",
    as_prefix: true,
    as_slash: true,
  }),

  params: new ParamsBuilder()
    .addString({
      name: "ciudad",
      description: "Ciudad a consultar",
      required: true,
      choices: [
        { name: "Madrid", value: "madrid" },
        { name: "Barcelona", value: "barcelona" },
        { name: "Valencia", value: "valencia" },
      ],
    })
    .addString({
      name: "unidad",
      description: "Unidad de temperatura",
      required: false,
      choices: [
        { name: "Celsius", value: "celsius" },
        { name: "Fahrenheit", value: "fahrenheit" },
      ],
    }),

  async code(ctx) {
    try {
      const ciudad = ctx.get("ciudad");
      const unidad = ctx.get("unidad") || "celsius";

      const weather = {
        madrid: { temp: 22, desc: "Soleado" },
        barcelona: { temp: 20, desc: "Parcialmente nublado" },
        valencia: { temp: 23, desc: "Soleado" },
      };

      const data = weather[ciudad];
      const temp = unidad === "fahrenheit" 
        ? (data.temp * 9/5) + 32 
        : data.temp;

      await ctx.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🌤️ Clima en ${ciudad}`)
            .setFields(
              { name: "Temperatura", value: `\`${temp}°${unidad === "celsius" ? "C" : "F"}\`` },
              { name: "Estado", value: `\`${data.desc}\`` }
            )
            .setColor(RED),
        ],
      });
    } catch (err) {
      console.error("[weather]", err);
      await ctx.send({
        content: "❌ Algo salió mal",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
```

### Comando con Grupo (GroupBuilder)

```javascript
const { GroupBuilder, CommandBuilder, ParamsBuilder } = require("gralonium");
const { EmbedBuilder, MessageFlags } = require("discord.js");

const RED = "#ff383d";

const data = {
  data: new GroupBuilder({
    name: "config",
    description: "Comandos de configuración",
    guildOnly: true,
    as_prefix: true,
    as_slash: true,
  })

  // Subcomando SET
  .addCommand({
    data: new CommandBuilder({
      name: "set",
      description: "Establecer configuración",
    }),
    params: new ParamsBuilder()
      .addString({
        name: "opcion",
        description: "Opción a configurar",
        required: true,
        choices: [
          { name: "Prefix", value: "prefix" },
          { name: "Welcome", value: "welcome" },
        ],
      })
      .addString({
        name: "valor",
        description: "Nuevo valor",
        required: true,
      }),

    async code(ctx) {
      try {
        const opcion = ctx.get("opcion");
        const valor = ctx.get("valor");

        // Guardar en BD
        // await db.setConfig(ctx.guild.id, opcion, valor);

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Configuración actualizada")
              .setFields(
                { name: "Opción", value: `\`${opcion}\`` },
                { name: "Valor", value: `\`${valor}\`` }
              )
              .setColor(RED),
          ],
        });
      } catch (err) {
        console.error("[config set]", err);
        await ctx.send({
          content: "❌ Algo salió mal",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  })

  // Subcomando GET
  .addCommand({
    data: new CommandBuilder({
      name: "get",
      description: "Ver configuración actual",
    }),
    params: new ParamsBuilder(),

    async code(ctx) {
      try {
        // Obtener de BD
        // const config = await db.getConfig(ctx.guild.id);

        const config = { prefix: ".", welcome: true };

        await ctx.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("⚙️ Configuración actual")
              .setFields(
                { name: "Prefix", value: `\`${config.prefix}\`` },
                { name: "Welcome", value: `\`${config.welcome ? "Sí" : "No"}\`` }
              )
              .setColor(RED),
          ],
        });
      } catch (err) {
        console.error("[config get]", err);
        await ctx.send({
          content: "❌ Algo salió mal",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  }),
};

module.exports = { data };
```

---

## 📋 Parámetros Disponibles

```javascript
const params = new ParamsBuilder()

  // STRING
  .addString({
    name: "nombre",
    description: "Tu nombre",
    required: true,
    min_length: 1,
    max_length: 50,
    choices: [
      { name: "Opción 1", value: "opt1" },
      { name: "Opción 2", value: "opt2" },
    ],
    autocomplete: false,
  })

  // NUMBER
  .addNumber({
    name: "cantidad",
    description: "Una cantidad",
    required: true,
    min_value: 1,
    max_value: 100,
  })

  // BOOLEAN
  .addBoolean({
    name: "activar",
    description: "Activar algo",
    required: false,
  })

  // MEMBER (Usuario del servidor)
  .addMember({
    name: "usuario",
    description: "Un miembro",
    required: true,
  })

  // CHANNEL (Canal)
  .addChannel({
    name: "canal",
    description: "Un canal",
    required: false,
    channel_types: ["GUILD_TEXT", "GUILD_VOICE"],
  })

  // ROLE (Rol)
  .addRole({
    name: "rol",
    description: "Un rol",
    required: true,
  })

  // ATTACHMENT (Archivo)
  .addAttachment({
    name: "archivo",
    description: "Un archivo",
    required: false,
  });
```

---

## 🛡️ Guards y Plugins

### Guards Disponibles

```javascript
const { Plugins, Bucket } = require("gralonium");

// Guards simples
Plugins.isGuild(ctx)                    // ¿Es en servidor?
Plugins.isOwner(ctx)                    // ¿Es dueño del bot?
Plugins.isNSFW(ctx)                     // ¿Es canal NSFW?

// Permisos de usuario
Plugins.hasPerms("Administrator")       // Tiene permisos
Plugins.hasAnyPerms("Ban", "Kick")      // Tiene cualquiera

// Permisos de bot
Plugins.hasBotPerms("Administrator")    // Bot tiene permisos
Plugins.hasAnyBotPerms("Ban", "Kick")   // Bot tiene cualquiera

// Tipo de canal
Plugins.isInChannelType("GUILD_TEXT")   // ¿Tipo específico?

// Cooldown
Plugins.cooldown(5, Bucket.User)        // 5 segundos por usuario

// Guard personalizado
Plugins.check(async (ctx) => {
  return ctx.author.id === "12345";
})
```

### Usar Guards en Comandos

```javascript
data: new CommandBuilder({
  name: "admin",
  description: "Comando solo para admins",
  guards: [
    Plugins.isGuild,
    Plugins.isOwner,
    Plugins.hasBotPerms("Administrator"),
    async (ctx) => {
      // Guard personalizado
      return ctx.guild.name.includes("test");
    },
  ],
})
```

---

## ⏱️ Cooldowns

### Tipos de Buckets

```javascript
const { Bucket } = require("gralonium");

Bucket.User      // Por usuario global
Bucket.Member    // Por miembro de servidor
Bucket.Guild     // Por servidor
Bucket.Channel   // Por canal
```

### Usar Cooldowns

```javascript
data: new CommandBuilder({
  name: "mycommand",
  description: "Un comando",
  cooldown: {
    seconds: 10,
    bucket: Bucket.User  // 10 segundos por usuario
  },
})
```

---

## 📡 Eventos

### Event: messageCreate

```javascript
const { EventBuilder } = require("gralonium");

module.exports = {
  data: new EventBuilder({
    name: "messageCreate",
    once: false,
    description: "Se ejecuta cuando alguien envía un mensaje",
  }),

  async code(message) {
    // Ignorar bots
    if (message.author.bot) return;

    // Ignorar DMs
    if (!message.guild) return;

    console.log(`[${message.guild.name}] ${message.author.tag}: ${message.content}`);

    // Auto-responder
    if (message.content.includes("hola")) {
      await message.reply(`¡Hola ${message.author.username}! 👋`);
    }
  },
};
```

### Event: ready

```javascript
const { EventBuilder } = require("gralonium");

module.exports = {
  data: new EventBuilder({
    name: "ready",
    once: true,
    description: "Se ejecuta cuando el bot está listo",
  }),

  async code(client) {
    console.log(`✅ ${client.user.tag} está en línea`);
    console.log(`📊 Servidores: ${client.guilds.cache.size}`);
    
    client.user.setActivity("con los comandos", { type: "PLAYING" });
  },
};
```

### Event: guildMemberAdd

```javascript
const { EventBuilder } = require("gralonium");
const { EmbedBuilder } = require("discord.js");

const RED = "#ff383d";

module.exports = {
  data: new EventBuilder({
    name: "guildMemberAdd",
    once: false,
    description: "Se ejecuta cuando alguien se une al servidor",
  }),

  async code(member) {
    const channel = member.guild.channels.cache.find(
      ch => ch.name === "bienvenidas"
    );

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("¡Bienvenido!")
      .setDescription(`Bienvenido a ${member.guild.name}, ${member}`)
      .setThumbnail(member.user.displayAvatarURL())
      .setColor(RED)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  },
};
```

---

## 🚨 Error Handling

### Todos los Errores Disponibles

```javascript
const { Errors } = require("gralonium");

// Errores de contexto
Errors.GuildOnly                   // Solo en servidores
Errors.NotOwner                    // No es dueño
Errors.NotNSFW                     // No es canal NSFW

// Errores de comandos
Errors.CommandNotFound             // Comando no existe
Errors.UnknownCommandError         // Error desconocido

// Errores de parámetros
Errors.MissingRequiredParam        // Parámetro faltante
Errors.InvalidParam                // Parámetro inválido
Errors.InvalidParamNumber          // Número inválido
Errors.InvalidParamBoolean         // Booleano inválido
Errors.InvalidParamChoice          // Opción inválida
Errors.InvalidParamMember          // Miembro inválido
Errors.InvalidParamChannel         // Canal inválido
Errors.InvalidParamRole            // Rol inválido
Errors.InvalidChannelType          // Tipo de canal inválido
Errors.InvalidParamAttachment      // Archivo inválido

// Errores de permisos
Errors.MissingPermission           // Permisos de usuario faltantes
Errors.MissingChannelPermission    // Permisos de canal del usuario
Errors.MissingBotPermission        // Permisos de bot faltantes
Errors.MissingBotChannelPermission // Permisos de canal del bot

// Errores de restricciones
Errors.OnlyForIDs                  // Solo para IDs específicas
Errors.CommandInCooldown           // En cooldown
Errors.RestrictedUser              // Usuario bloqueado
Errors.RestrictedGuild             // Servidor bloqueado
Errors.NotInChannelType            // Tipo de canal no permitido
```

### Manejo de Errores

```javascript
client.on("frameworkError", (err, ctx) => {
  if (err instanceof Errors.MissingPermission) {
    ctx?.send(`❌ Necesitas: ${err.permissions.join(", ")}`);
  }
  else if (err instanceof Errors.CommandInCooldown) {
    ctx?.send(`⏰ En cooldown por ${err.timeLeft}ms`);
  }
  else if (err instanceof Errors.InvalidParamMember) {
    ctx?.send(`❌ Usuario no encontrado`);
  }
  // ... más errores
});
```

---

## 📖 Context (ctx)

```javascript
// Propiedades del contexto
ctx.bot                // Cliente del bot
ctx.author             // Usuario que ejecutó el comando
ctx.member             // GuildMember (si es en servidor)
ctx.guild              // Guild (si es en servidor)
ctx.channel            // Canal donde se ejecutó
ctx.message            // Message object (si fue prefix)
ctx.interaction        // Interaction (si fue slash)
ctx.command            // Comando actual
ctx.parent             // Grupo padre (si existe)
ctx.args               // Argumentos crudos
ctx.prefix             // Prefix usado

// Métodos
ctx.get("paramName")              // Obtener parámetro procesado
ctx.send(mensaje)                 // Enviar mensaje (prefix o slash)
ctx.react("👍", "👎")             // Reaccionar al mensaje
```

---

## 🎪 Context.send() - Ejemplos

```javascript
// Texto simple
await ctx.send("Hola mundo");

// Con embed
await ctx.send({
  embeds: [new EmbedBuilder()
    .setTitle("Título")
    .setDescription("Descripción")
    .setColor(RED)
  ]
});

// Con componentes
await ctx.send({
  content: "¿Sí o no?",
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("yes")
        .setLabel("Sí")
        .setStyle(ButtonStyle.Primary)
    )
  ]
});

// Con archivos
await ctx.send({
  files: [new AttachmentBuilder("./image.png")]
});

// Ephemeral (solo visible para el usuario)
await ctx.send({
  content: "Mensaje privado",
  flags: MessageFlags.Ephemeral
});
```

---

## 🧪 Componentes Experimentales

```javascript
const { Paginator, Confirmator } = require("gralonium/experiments");

// Paginator
const paginator = new Paginator();
const sent = await ctx.send("Página 1");
paginator.setMessage(sent);
paginator.start();

// Confirmator
const confirmator = new Confirmator();
const sent = await ctx.send("¿Estás seguro?");
confirmator.setMessage(sent);
confirmator.start();
```

---

## ⚙️ Opciones del Cliente

```javascript
const client = new Gralonium({
  // Discord.js
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],

  // Framework
  prefix: ".",                      // string | string[] | function
  guildOnly: false,                 // boolean
  owners: ["123456789"],            // string[]
  debug: true,                      // boolean
  autoSync: true,                   // boolean
  bindProcessHandlers: true,        // boolean
  retryOnRateLimit: true,           // boolean
  replyOnEdit: true,                // boolean
  
  // Restricciones
  restrictions: {
    userIDs: new Set(["123"]),      // Usuarios bloqueados
    guildIDs: new Set(["456"]),     // Servidores bloqueados
  },
});
```

---

## Breaking Changes

* Client construction now validates required framework/runtime options (`intents`, `prefix`).
* Prefix parsing now resolves routing first and then parses args from raw message content, improving quote/space fidelity.
* Component utilities (`Paginator`, `Confirmator`) now require `setMessage()` and use message-scoped collectors.
* `Context#send()` now blocks autocomplete replies and supports optional bounded retry for 429 responses.

## Migration Notes

* Prefer `const { Gralonium } = require("gralonium")`.
* Ensure your client options always include `intents` and `prefix`.
* If you use `Paginator`/`Confirmator`, always call `.setMessage(sentMessage)` before `.start()`.
* Use `retryOnRateLimit: true` only when you want bounded automatic retries for send operations.

## 📝 Notes

* Unified execution for slash and prefix command handlers is implemented in `Utils.executeCommand()`.
* Use `frameworkError` to centralize framework/runtime errors.
* Guards are evaluated in order and all must return `true` for the command to execute.
* Use `MessageFlags.Ephemeral` to send messages only visible to the command executor.

## 🔗 Aliases Disponibles

```javascript
// El cliente puede ser referido de varias formas
const { Gralonium } = require("gralonium");
const { RedBot } = require("gralonium");
const { Erine } = require("gralonium");
const { Enire } = require("gralonium");

// Todos son el mismo cliente
```

## 📄 License

MIT

## ⚠️ Disclaimer

Not affiliated with Discord or discord.js.

---

**Made with ❤️ by carzo**
