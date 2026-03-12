# RedBot

> Bot de Discord multifunción con personalidad propia, IA integrada y herramientas completas de moderación y administración.

---

## ¿Qué es RedBot?

RedBot es un bot de Discord en español desarrollado con **discord.js v14**, el framework **Erine** y la API de **Google Gemini**. Combina un completo sistema de moderación, herramientas de administración de roles y canales, información de servidor/usuario y comandos de diversión generados por IA, todo en un único bot con personalidad sarcástica y respuestas en español neutro.

Soporta tanto **comandos de barra** (`/`) como **comandos con prefijo** (`.` por defecto, personalizable por servidor).

---

## ¿Qué lo diferencia de otros bots?

| Característica | RedBot | Bots genéricos |
|---|---|---|
| **IA conversacional con memoria** | ✅ Historial de hasta 10 mensajes por usuario, se limpia automáticamente | ❌ Sin contexto entre mensajes |
| **Rotación automática de claves Gemini** | ✅ Cambia de clave API si alcanza el límite de peticiones | ❌ No aplica |
| **Búsqueda en internet inteligente** | ✅ Detecta automáticamente cuándo necesita información en tiempo real | ❌ No aplica |
| **Personalidad en español** | ✅ Tono sarcástico, respuestas naturales en español neutro | ❌ Mayormente en inglés |
| **Conversaciones por respuesta** | ✅ Responde al mensaje del bot para continuar la conversación | ❌ Cada pregunta es independiente |
| **Prefijo personalizable por servidor** | ✅ Almacenado en MongoDB, con caché por rendimiento | ⚠️ Algunos sí, la mayoría no |
| **Bans temporales persistentes** | ✅ Se recuperan al reiniciar el bot desde la base de datos | ⚠️ Algunos sí, muchos no |
| **Doble modo de comando** | ✅ Slash + prefijo para todos los comandos | ⚠️ Muchos solo slash |

---

## ¿Por qué añadir RedBot a tu servidor?

- 🛡️ **Moderación completa** — desde expulsiones y baneo masivo hasta sistema de advertencias con base de datos y logs automáticos.
- 🤖 **IA con memoria** — pregúntale cualquier cosa, responde en tu mismo idioma y recuerda el contexto de la conversación.
- 🔧 **Administración avanzada** — gestiona roles, canales, permisos y configuración del servidor sin salir de Discord.
- 😈 **Diversión con personalidad** — opiniones sin filtro, críticas, roasts y teorías conspirativas generadas por IA.
- 🌐 **En español** — mensajes, errores y ayuda completamente en español neutro.
- ⚡ **Dual-mode** — usa slash commands o el prefijo que prefieras (`.` por defecto, configurable).
- 💾 **Persistencia** — advertencias, logs, bans temporales y configuración de prefijo guardados en MongoDB.

---

## Grupos de comandos

RedBot organiza sus **57 comandos** en **7 grupos** temáticos más el comando `/help`:

| Grupo | Descripción | Nº de comandos |
|---|---|---|
| [🔧 Utilidad](#-grupo-utilidad) | Información del bot, IA, prefijo | 6 |
| [👤 Usuario](#-grupo-usuario) | Info, avatar, banner, roles y permisos | 5 |
| [🛡️ Moderación](#️-grupo-moderación) | Ban, kick, mute, warns, logs y más | 15 |
| [🏠 Servidor](#-grupo-servidor) | Info, logo, banner, emojis y roles del servidor | 5 |
| [🎭 Roles](#-grupo-roles) | Gestión completa de roles | 10 |
| [📺 Canal](#-grupo-canal) | Gestión completa de canales | 10 |
| [🎲 Diversión](#-grupo-diversión) | Opiniones, críticas, roasts y teorías | 5 |
| [❓ Ayuda](#-comando-help) | Menú de ayuda interactivo | 1 |

---

## Lista completa de comandos

### 🔧 Grupo Utilidad

| Comando | Uso (prefijo) | Aliases | Descripción |
|---|---|---|---|
| `ask` | `.ask <pregunta>` | `ai`, `ia` | Pregúntale algo a la IA (Gemini) con memoria de conversación. |
| `ping` | `.ping` | — | Muestra la latencia del bot (mensaje + API). |
| `botinfo` | `.botinfo` | `bot`, `info` | Muestra información general del bot: versión, servidores, usuarios y uptime. |
| `invite` | `.invite` | `inv` | Envía el enlace de invitación del bot y el servidor de soporte. |
| `setprefix` | `.setprefix <nuevo>` | `prefix` | Cambia el prefijo del bot en el servidor (requiere Administrador). |
| `askreset` | `.askreset` | `aireset`, `reset` | Borra tu historial de conversación con la IA. |

---

### 👤 Grupo Usuario

| Comando | Uso (prefijo) | Aliases | Descripción |
|---|---|---|---|
| `user info` | `.user [@usuario]` | `userinfo`, `ui`, `whois` | Muestra información general del usuario: ID, fecha de creación, fecha de entrada y roles. |
| `user avatar` | `.avatar [@usuario]` | `av`, `pfp` | Muestra el avatar del usuario en tamaño completo. |
| `user banner` | `.banner [@usuario]` | `userbanner`, `ub` | Muestra el banner de perfil del usuario. |
| `user roles` | `.uroles [@usuario]` | `userroles`, `ur` | Lista todos los roles de un usuario (paginado). |
| `user permissions` | `.perms [@usuario]` | `userperms`, `up` | Muestra los permisos del usuario en el servidor. |

---

### 🛡️ Grupo Moderación

| Comando | Uso (prefijo) | Aliases | Descripción |
|---|---|---|---|
| `mod ban` | `.ban <@usuario> [razón]` | — | Banea a un usuario del servidor. |
| `mod unban` | `.unban <id> [razón]` | — | Desbanea a un usuario por su ID. |
| `mod softban` | `.softban <@usuario> [razón]` | `sb` | Banea y desbanea al instante para eliminar mensajes recientes. |
| `mod tempban` | `.tempban <@usuario> <tiempo> [razón]` | `tb` | Banea temporalmente a un usuario (ej. `1d`, `2h`, `30m`). Se desbanea automáticamente. |
| `mod massban` | `.massban <@u1> [@u2] ... [razón]` | `mb` | Banea hasta 5 usuarios a la vez. |
| `mod kick` | `.kick <@usuario> [razón]` | — | Expulsa a un usuario del servidor. |
| `mod mute` | `.mute <@usuario> <tiempo> [razón]` | `timeout`, `silenciar` | Aplica timeout/silencio a un usuario. |
| `mod unmute` | `.unmute <@usuario> [razón]` | `untimeout`, `desmutear` | Quita el timeout a un usuario. |
| `mod purge` | `.purge <cantidad> [@usuario]` | `clear`, `limpiar` | Elimina mensajes del canal (opcionalmente de un usuario concreto). |
| `mod warn` | `.warn <@usuario> <razón>` | `advertir` | Emite una advertencia al usuario (se guarda en la base de datos). |
| `mod removewarn` | `.removewarn <warnID>` | `rwarn`, `delwarn` | Elimina una advertencia concreta por su ID. |
| `mod clearwarns` | `.clearwarns <@usuario>` | `cwarns`, `resetwarns` | Borra todas las advertencias de un usuario. |
| `mod warnings` | `.warnings <@usuario>` | `warns`, `infracciones` | Muestra todas las advertencias de un usuario. |
| `mod setlogs` | `.setlogs <#canal>` | `logs` | Establece el canal donde se registran las acciones de moderación. |
| `mod removelogs` | `.removelogs` | `dellogs`, `nologs` | Desactiva el registro de logs de moderación en el servidor. |

---

### 🏠 Grupo Servidor

| Comando | Uso (prefijo) | Aliases | Descripción |
|---|---|---|---|
| `server info` | `.server` | `sv`, `serverinfo`, `si` | Muestra estadísticas del servidor: miembros, canales, roles, boosts, fecha de creación y propietario. |
| `server logo` | `.logo` | `icon`, `servericon` | Muestra el logo/icono del servidor en tamaño completo. |
| `server banner` | `.sbanner` | `serverbanner` | Muestra el banner del servidor en tamaño completo. |
| `server emojis` | `.emojis` | `serveremojis`, `emoji` | Lista todos los emojis personalizados del servidor. |
| `server roles` | `.sroles` | `serverroles`, `listroles` | Lista todos los roles del servidor (paginado). |

---

### 🎭 Grupo Roles

| Comando | Uso (prefijo) | Aliases | Descripción |
|---|---|---|---|
| `role info` | `.role <@rol>` | `roleinfo`, `ri` | Muestra información de un rol: ID, color, posición, permisos y visibilidad. |
| `role icon` | `.ricon <@rol>` | `roleicon` | Muestra el icono de un rol (si tiene). |
| `role color` | `.rcolor <@rol>` | `rolecolor`, `rolcolor` | Muestra el color hexadecimal de un rol. |
| `role users` | `.rusers <@rol>` | `roleusers`, `rwho` | Lista todos los usuarios que tienen un rol concreto. |
| `role add` | `.radd <@usuario> <@rol>` | `roleadd`, `addrole` | Asigna un rol a un usuario. |
| `role remove` | `.rremove <@usuario> <@rol>` | `roleremove`, `delrole` | Quita un rol a un usuario. |
| `role rename` | `.rrename <@rol> <nombre>` | `renamerole` | Renombra un rol. |
| `role hoist` | `.rhoist <@rol>` | `rolehoist` | Alterna si el rol se muestra separado en la lista de miembros. |
| `role mentionable` | `.rmention <@rol>` | `rolemention`, `mentionable` | Alterna si el rol puede ser mencionado por cualquier usuario. |
| `role random` | `.rrandom` | `randomrole` | Muestra un rol aleatorio del servidor. |

---

### 📺 Grupo Canal

| Comando | Uso (prefijo) | Aliases | Descripción |
|---|---|---|---|
| `channel info` | `.cinfo [#canal]` | `chinfo`, `channelinfo` | Muestra información del canal: ID, tipo, tema, slowmode y estado NSFW. |
| `channel rename` | `.crename <#canal> <nombre>` | `chrename`, `chanrename` | Renombra un canal. |
| `channel lock` | `.lock [#canal]` | `lockdown`, `cerrar` | Bloquea el canal impidiendo que @everyone envíe mensajes. |
| `channel unlock` | `.unlock [#canal]` | `abrir`, `desbloquear` | Desbloquea un canal previamente bloqueado. |
| `channel slowmode` | `.sm <tiempo> [#canal]` | `slowmode`, `lento` | Establece el slowmode del canal (0 para desactivar, máximo 6 h). |
| `channel nuke` | `.nuke [#canal]` | `vaciar`, `limpiar` | Recrea el canal eliminando todos sus mensajes. |
| `channel clone` | `.clone [#canal]` | `clonar`, `duplicar` | Clona el canal con toda su configuración y permisos. |
| `channel permit` | `.permit <@usuario> [#canal]` | `allow`, `acceso` | Da acceso a un usuario en un canal específico. |
| `channel deny` | `.deny <@usuario> [#canal]` | `block`, `denegar` | Quita el acceso a un usuario en un canal específico. |
| `channel hide` | `.hide [#canal]` | `ocultar`, `esconder` | Oculta el canal a @everyone. |

---

### 🎲 Grupo Diversión

> Todos los comandos de este grupo usan IA (Gemini) para generar respuestas únicas y con personalidad.

| Comando | Uso (prefijo) | Aliases | Descripción |
|---|---|---|---|
| `fun opinion` | `.opinion <tema>` | `op`, `opina` | Obtén una opinión sin filtros sobre cualquier tema. |
| `fun critica` | `.critica <tema>` | `criticar` | Recibe una crítica despiadada de algo. |
| `fun excusa` | `.excusa [situación]` | `coartada` | Genera una excusa ridícula pero creativa. |
| `fun teoria` | `.teoria <tema>` | `conspira` | Crea una teoría conspirativa sobre lo que quieras. |
| `fun roast` | `.roast [@usuario]` | `burn` | Hace un roast brutal a un usuario usando su información real. |

---

### ❓ Comando Help

| Comando | Uso | Descripción |
|---|---|---|
| `help` | `/help` o `.help` | Abre el menú de ayuda interactivo con botones y selector de categorías para navegar por todos los comandos. |

---

## Funcionalidades principales

### 🤖 IA con memoria conversacional
- Modelo base: **Gemini Flash Lite** para preguntas estándar.
- Cuando detecta que la pregunta requiere información en tiempo real, cambia automáticamente a **Gemini Flash con Google Search**.
- Cada usuario tiene un historial de hasta **10 mensajes** que se borra automáticamente tras **10 minutos** de inactividad.
- Responde al mensaje del bot para continuar la conversación sin volver a usar el comando.
- **Rotación automática de claves API**: si una clave alcanza el límite de peticiones, cambia a la otra sin interrupciones.

### 🛡️ Sistema de moderación
- Todos los comandos de moderación registran la acción en el canal de logs configurado con `/mod setlogs`.
- Los **bans temporales** se persisten en MongoDB y se restauran automáticamente al reiniciar el bot.
- El **sistema de advertencias** guarda cada warn en la base de datos con su ID único, moderador responsable y razón.

### ⚙️ Configuración por servidor
- El prefijo del bot se puede cambiar por servidor con `/util setprefix` y se almacena en MongoDB con caché en memoria para mayor rendimiento.

---

## Stack tecnológico

| Tecnología | Versión | Uso |
|---|---|---|
| [discord.js](https://discord.js.org/) | v14 | Librería principal de Discord |
| [Erine](https://www.npmjs.com/package/erine) | v2 | Framework de comandos slash y prefijo |
| [@google/genai](https://www.npmjs.com/package/@google/genai) | v1 | Integración con Google Gemini |
| [mongoose](https://mongoosejs.com/) | v9 | ODM para MongoDB |
| [dotenv](https://www.npmjs.com/package/dotenv) | v17 | Gestión de variables de entorno |

---

## Variables de entorno requeridas

```
TOKEN=          # Token del bot de Discord
MONGO=          # URI de conexión a MongoDB
GEMINI_KEY=     # Clave API de Google Gemini (principal)
GEMINI_KEY2=    # Clave API de Google Gemini (respaldo)
```

---

## Licencia

MIT © carzo.
