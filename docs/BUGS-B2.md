# Bugs Pendientes — Lote B2

Lista de bugs aprobados para corregir en commits dedicados en el **Lote B2** (un commit y prueba por bug, manteniendo los límites y comportamiento fuera de cada fix).

---

## 1. Doble desescape de `&amp;` en `decodeHtmlEntities`
- **Archivo:** `src/shared/utils.js` (`L89-103`) y consumidores como `src/feeds.js`.
- **Causa:** Por compatibilidad con el comportamiento previo al refactor, `decodeHtmlEntities` tiene `ampFirst = true` por defecto y reemplaza `&amp;` antes que `&lt;`, `&gt;`, `&quot;`, `&#39;`, etc. Eso provoca que una cadena doblemente escapada como `&amp;lt;script&amp;gt;` se desescape dos veces hasta `<script>`.
- **Solución prevista en Lote B2:** Mover `.replace(/&amp;/g, "&")` siempre después del resto de entidades y retirar el parámetro `ampFirst`.

## 2. `removewarn` y `clearwarns` no eliminan los registros de `ModCase`
- **Archivo:** `src/moderation.js` (`removeWarnById` en `L156-158`, `clearWarnsForUser` en `L160-163`) y `commands/slash/mod.js` (`removewarn` / `clearwarns`).
- **Causa:** `addWarn` crea tanto un documento en `Warn` como un caso en `ModCase` (`type: "warn"`, `caseId: normalizedWarnId`), pero `removeWarnById` y `clearWarnsForUser` solo borran de `Warn`. Como `/mod history` y `Expediente Mod` consultan `listUnifiedHistoryForUser` (que une `ModCase` y `Warn`), las advertencias eliminadas siguen apareciendo en el historial y en el conteo del expediente.
- **Verificación de `caseId`:** Todos los `caseId` en `ModCase` (`src/moderation.js:44-74`) se generan con `generateId(6)` aleatorio criptográfico (`generateId(7)` si hay colisión `11000`), nunca por contador incremental ni `countDocuments`. Borrar documentos de `ModCase` no deja huecos ni provoca duplicados.
- **Solución prevista en Lote B2:** Al borrar una advertencia en `removeWarnById` o limpiar todas en `clearWarnsForUser`, eliminar también los documentos correspondientes de `ModCase` (`{ guildId, type: "warn", caseId: normalizedWarnId }` / `{ guildId, userId, type: "warn" }`).

## 3. `/auto ruleadd` guarda menciones `<#id>` / `<@&id>` sin normalizar y `automation.js` falla al evaluarlas
- **Archivos:** `commands/slash/auto.js` (`ruleadd`, `L368-401`) y `src/automation.js` (`matchesRuleCondition` `L166-180`, `dispatchAutoRules` `L182-228`).
- **Causa:**
  1. `ruleadd` guarda `conditionValue` crudo para `in_channel` / `has_role`; y en `add_role` / `remove_role` extrae `roleId` solo para validar (`L375`), pero guarda `actionValue` crudo (`<@&id>`) en `L395` (y `send_channel` no limpia `<#id>` antes de `|`).
  2. `src/automation.js` compara `channel.id === val`, `member.roles.cache.has(val)`, `SNOWFLAKE_RE.test(firstPart)` y `guild.roles.cache.get(actionVal.trim())` esperando snowflakes numéricos puros.
- **Solución prevista en Lote B2:** Normalizar menciones (`<#id>` / `<@&id>`) **tanto al guardar** en `ruleadd` **como al evaluar** en `src/automation.js`, de modo que las reglas nuevas queden limpias y las reglas ya guardadas en DB con menciones funcionen sin migración.

## 4. `sendLog` borra el canal de logs de la colección `Log` ante errores transitorios
- **Archivo:** `src/guild.js` (`sendLog`, `L382-395`).
- **Causa:** `guild.channels.fetch(channelId).catch(() => null)` colapsa cualquier error (red, `5xx`, rate limit, `50001` / `50013`) a `null`, y luego `if (!channel)` ejecuta `await Log.deleteOne({ guildId: guild.id })` y `logChannelCache.delete(guild.id)`, desactivando permanentemente los logs del servidor. *(Nota: la escritura afecta a la colección `Log`, no a `GuildConfig`.)*
- **Solución prevista en Lote B2:** Capturar el error real de `guild.channels.fetch(channelId)` y ejecutar `Log.deleteOne` + `logChannelCache.delete` **únicamente** cuando `err?.code === 10003` (`Unknown Channel`). Ante `50001`, `50013`, timeouts o errores `5xx`, retornar `false` sin borrar la configuración de `Log`.

## 5. `events/error.js` atribuye cualquier error `50013` / `50006` a `EmbedLinks`
- **Archivo:** `events/error.js` (`resolveMissingBotPermissions`, `L27-52`).
- **Causa:** Cuando falla una llamada a Discord con `50013` (`Missing Permissions`) o `50006` y el bot sí tiene `ViewChannel`, `SendMessages` y `EmbedLinks` en el canal, el fallback `if (!missing.length && isDiscordPermError(err)) missing.push("EmbedLinks")` informa al usuario que falta `EmbedLinks` aunque el permiso faltante sea `ManageRoles`, `BanMembers`, `ManageChannels`, etc.
- **Solución prevista en Lote B2:** Eliminar el fallback que empuja `"EmbedLinks"` cuando `missing` está vacío, dejando que `ERROR_RULES` use `requiredFallback` (`"los permisos necesarios"` / `"the required permissions"`). Actualizar la comparativa de las 16 reglas contra el baseline documentando esa diferencia intencional.

## 6. `roles.cache.has` falla cuando `member` es un `APIGuildMember` no cacheado (`roles` es `string[]`)
- **Archivos afectados:**
  - `commands/interactions/ticketActions.js` (`isStaff`, `L88-90`)
  - `commands/slash/tickets.js` (`isTicketStaff`, `L21-26`)
  - `src/tagscript.js` (`evaluateCondition` `hasrole:`, `L86-88`)
  - `src/automation.js` (`matchesRuleCondition` `has_role`, `L171`, y `executeTagActions` `L81,87`)
  - `src/moderationExtra.js` (`evaluateMessageAutomod` `ignoredRoles`, `L252`)
- **Causa:** Se invoca `member.roles?.cache?.has(...)`, lo cual devuelve `undefined` cuando Discord entrega un `APIGuildMember` sin cachear donde `member.roles` es un arreglo de IDs (`string[]`).
- **Solución prevista en Lote B2:** Extraer `memberHasRole(member, roleId)` en `src/shared/utils.js` soportando tanto `GuildMemberRoleManager` (`roles.cache.has`) como `string[]` (`Array.isArray(member.roles) && member.roles.includes(roleId)`) y aplicarlo en todos los sitios afectados.

## 7. `ticketActions.js` (`claim`) actualiza tickets sin filtrar por `status: "open"`
- **Archivo:** `commands/interactions/ticketActions.js` (`claim`, `L99`).
- **Causa:** `Ticket.updateOne({ channelId: interaction.channelId }, { $set: { claimedBy: interaction.user.id } })` no incluye `status: "open"` en el filtro (a diferencia de la consulta previa en `L79`), exponiéndose a condiciones de carrera si el ticket se cierra simultáneamente.
- **Solución prevista en Lote B2:** Filtrar por `{ channelId: interaction.channelId, status: "open" }` (o `{ _id: ticket._id, status: "open" }`).

## 8. `Expediente Mod` no revalida la jerarquía del moderador en el colector
- **Archivo:** `src/contextMenus.js` (`handleModDossierContext`, `L422-555`) y `commands/slash/mod.js` (`hierarchyChecks`, `L67-79`).
- **Causa:** La comprobación inicial (`canTarget` en `L338-342`) solo se evalúa al renderizar el expediente. Durante los 3 minutos del colector, `mute`, `kick` y `warn` no revalidan la jerarquía del moderador frente al objetivo (y `warn` ni siquiera valida jerarquía de roles).
- **Solución prevista en Lote B2:** Reutilizar `hierarchyChecks` de `commands/slash/mod.js` (moviéndola a módulo compartido sin crear otra función) dentro del colector de `Expediente Mod` antes de ejecutar `mute`, `kick` y `warn`, con miembros actualizados.
