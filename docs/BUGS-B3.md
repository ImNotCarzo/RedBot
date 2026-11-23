# Bugs Pendientes — Lote B3

Backlog priorizado de bugs detectados en la auditoría de Fase 1 que quedan fuera del Lote B2 (sin corregir todavía; ordenados por gravedad).

---

## Gravedad Alta

### 1. `canManageGuild` confía 24h en `session.adminGuildIds` sin revalidar permisos actuales
- **Archivo:** `src/api.js` (`canManageGuild` en `L503-513`, `handleDashboardGuilds` en `L735-744`, `DASHBOARD_SESSION_TTL_MS = 24h` en `L26`).
- **Problema:** Al iniciar sesión en el dashboard se firma un token de 24 horas con `adminGuildIds`. Si a un usuario se le revoca `ManageGuild` / `Administrator` o deja el servidor, `canManageGuild` sigue autorizando peticiones de lectura y escritura a `/api/tickets/:guildId` mientras el token no expire, sin contrastar contra el estado actual del miembro en `guild` cuando está disponible.

### 2. Logout permitido por `GET` con cookie `SameSite=Lax`
- **Archivo:** `src/api.js` (`L1241, L1247`, `handleAuthLogout` en `L778-792`).
- **Problema:** Las rutas `/auth/logout` y `/api/auth/logout` aceptan `GET` además de `POST`, y la cookie de sesión usa `SameSite=Lax`. Cualquier enlace externo o redirección de nivel superior puede cerrar la sesión del usuario en el dashboard (CSRF de logout).

### 3. `deliverReminder` borra el documento de MongoDB antes de enviarlo
- **Archivo:** `src/reminders.js` (`deliverReminder`, `L60-101`).
- **Problema:** En `L60` se ejecuta `Reminder.findOneAndDelete({ _id: doc._id })` antes de intentar `user.send` / `channel.send`. Si Discord falla o hay una excepción en el `try` que dispara el reintento (`L98-100`), o si ambos envíos fallan (`sent === false`), el documento ya no existe en base de datos: si el bot se reinicia o vuelve a programar el recordatorio, nunca se recupera.

### 4. Éxito falso en `/util remind` cuando la base de datos está caída
- **Archivos:** `commands/slash/util.js` (`remindCommand`, `L857-875`) y `src/reminders.js` (`createReminder`, `L104-105`).
- **Problema:** Cuando `isDbReady(Reminder)` es `false`, `createReminder` retorna `{ error: "db" }`, pero `remindCommand` solo comprueba `if (result.error === "limit")`. En caso de `error === "db"` continúa hacia `L869-875` y responde al usuario con la tarjeta verde de `"Recordatorio creado"` aunque no se guardó ni programó nada.

---

## Gravedad Media

### 5. Parámetros `Boolean` con comandos de prefijo convierten `"false"` en `true`
- **Archivos:** `src/adapter.js` (`parsePrefixedArgsForSlash`, `L694-697`) y consumidores que evalúan `Boolean(ctx.get(...))` o truthiness (ej. `commands/slash/channel.js:995` con `limpiar`).
- **Problema:** Para parámetros tipo `Boolean` (`def.type === 5`), `parsePrefixedArgsForSlash` asigna el **string** `"true"` o `"false"` en `values[def.name]`. Cualquier comando que evalúe truthiness (`Boolean(val)` o `if (val)`) trata la cadena `"false"` como `true`.

### 6. `/mod unmute` no valida si el timeout ya expiró
- **Archivo:** `commands/slash/mod.js` (`unmute`, `L562-564`).
- **Problema:** Comprueba `if (!member.communicationDisabledUntil)` en lugar de verificar `member.communicationDisabledUntilTimestamp > Date.now()`. Discord suele conservar un `communicationDisabledUntil` pasado en caché cuando un timeout ya venció, por lo que el comando dice "desilenciar" y registra un caso `unmute` innecesario sobre un usuario que ya no está silenciado.

### 7. `/mod unban` no limpia menciones `<@!...>` / `<@...>`
- **Archivo:** `commands/slash/mod.js` (`unban`, `L162-168`).
- **Problema:** Toma `const userId = ctx.get("id")` sin extraer dígitos de una mención (`<@123...>` / `<@!123...>`). Si el moderador pega la mención del usuario en lugar del ID numérico, `guild.bans.fetch(userId)` falla y responde que no está baneado (o da error de ID inválido).

### 8. Logs y tarjetas de Drama Watcher duplicados en `autoModerationActionExecution`
- **Archivo:** `events/autoModerationActionExecution.js` (`L13-59`).
- **Problema:** Cuando una regla nativa de Discord AutoMod tiene varias acciones configuradas (por ejemplo `BlockMessage` + `SendAlertMessage` + `Timeout`), Discord emite un evento `autoModerationActionExecution` por cada acción sobre el mismo mensaje/ejecución. El listener envía múltiples embeds de log y múltiples tarjetas interactivas en Drama Watcher para el mismo incidente al no deduplicar por mensaje/ejecución.

### 9. `/tickets claim` actualiza `Ticket` sin filtrar por `status: "open"`
- **Archivo:** `commands/slash/tickets.js` (`claim`, `L208`).
- **Problema:** Ejecuta `Ticket.updateOne({ channelId: ctx.channel.id }, { $set: { claimedBy: ctx.user.id } })` sin incluir `status: "open"` en el filtro. Si el ticket se cierra entre la validación de `requireTicketContext` (`L203-207`) y el `updateOne`, puede modificar un ticket ya cerrado o un registro histórico del mismo canal.

---

## Gravedad Baja

### 10. `formatSlowmode(90)` trunca segundos y minutos restantes
- **Archivo:** `commands/slash/channel.js` (`formatSlowmode`, `L29-34`).
- **Problema:** Usa `Math.floor(seconds / 60) + "m"` para valores `>= 60` y `Math.floor(seconds / 3600) + "h"` para `>= 3600`, por lo que `90` segundos se formatea como `"1m"` (perdiendo `30s`) y `5400` segundos como `"1h"` (perdiendo `30m`). Discord permite cualquier entero de `0` a `21600`s.

### 11. Reglas `AutopurgeRule` huérfanas cuando el canal se borra en Discord
- **Archivo:** `src/channelsExtra.js` (`runAutopurgeSweep`, `L90-104`).
- **Problema:** Si se elimina en Discord un canal que tenía autopurge activo, el barrido cada 30 segundos sigue cargando su `AutopurgeRule` e intentando `client.channels.fetch(rule.channelId)` indefinidamente (en lugar de limpiar el documento si Discord responde `10003` `Unknown Channel`).

### 12. Mejora de mensajes de permisos faltantes (`events/error.js` / `src/i18n.js`)
- **Archivos:** `events/error.js` (`resolveMissingBotPermissions` en `L27-48`, `ERROR_RULES` en `L54-74`, `requiredFallback` en `L143`) y `src/i18n.js` (`error.missing_perm`, `error.missing_bot_perm`, `error.missing_channel_perm`).
- **Problema:** Cuando no se puede determinar un permiso concreto (por ejemplo, en un `50013` por jerarquía de roles o un overwrite de canal), las plantillas envuelven el fallback genérico entre backticks (``necesito: `los requeridos` `` / ``I need: `the required ones` ``), lo cual se lee mal. Además, los 24 comandos que usan `Plugins.hasBotPerms(...)` crean closures opacos de `gralonium` cuyos permisos no pueden inspeccionarse ante un `50013` tardío; conviene separar una plantilla genérica sin backticks y valorar envolver `hasBotPerms` para comprobar también permisos declarados por el comando en el canal.
