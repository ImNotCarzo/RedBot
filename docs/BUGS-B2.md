# Bugs Pendientes — Lote B2

Lista de bugs identificados durante la auditoría y los lotes 1–6 para corregir en commits dedicados en el **Lote B2** (después del refactor estructural, sin mezclarlos con commits de limpieza ni de textos).

---

## 1. Doble desescape de `&amp;` en `decodeHtmlEntities`
- **Archivo:** `src/shared/utils.js` (`L89-103`) y consumidores como `src/feeds.js`.
- **Causa:** Por compatibilidad con el comportamiento previo al refactor, `decodeHtmlEntities` tiene `ampFirst = true` por defecto y reemplaza `&amp;` antes que `&lt;`, `&gt;`, `&quot;`, `&#39;`, etc. Eso provoca que una cadena doblemente escapada como `&amp;lt;script&amp;gt;` se desescape dos veces hasta `<script>`.
- **Solución prevista en Lote B2:** Cambiar el orden para que `&amp;` se reemplace siempre al final (`ampFirst = false`), eliminando el flag.

## 2. `removewarn` y `clearwarns` no eliminan los registros de `ModCase`
- **Archivo:** `src/moderation.js` (`removeWarnById` en `L156-158`, `clearWarnsForUser` en `L160-163`) y `commands/slash/mod.js` (`removewarn` / `clearwarns`).
- **Causa:** `addWarn` crea tanto un documento en `Warn` como un caso en `ModCase` (`type: "warn"`, `caseId: normalizedWarnId`), pero `removeWarnById` y `clearWarnsForUser` solo borran de `Warn`. Como `/mod warnings` y `Expediente Mod` consultan `listUnifiedHistoryForUser` (que une `ModCase` y `Warn`), las advertencias eliminadas siguen apareciendo en el historial y en el conteo del expediente.
- **Solución prevista en Lote B2:** Al borrar una advertencia en `removeWarnById` o limpiar todas en `clearWarnsForUser`, eliminar también los documentos correspondientes de `ModCase` (`{ guildId, type: "warn", caseId }` / `{ guildId, userId, type: "warn" }`).

## 3. `/auto ruleadd` guarda menciones de canal o rol sin extraer el ID
- **Archivo:** `commands/slash/auto.js` (`ruleadd`, `L610-655`).
- **Causa:** Cuando el usuario configura condiciones o acciones basadas en ID (`in_channel`, `has_role`, `add_role`, `remove_role`) y pasa una mención (`<#123456789012345678>` o `<@&123456789012345678>`) en `condicion_valor` o `accion_valor`, el valor se guarda tal cual con `<#...>` / `<@&...>`, por lo que la comparación exacta contra `channel.id` o `role.id` en `src/automation.js` nunca coincide.
- **Solución prevista en Lote B2:** Normalizar `condValue` y `actionValue` extrayendo el snowflake numérico cuando la condición o acción espera un ID de canal o rol (y validar que exista en el servidor).

## 4. `sendLog` borra `logChannelId` de la base de datos ante errores transitorios
- **Archivo:** `src/guild.js` (`sendLog`, `L111-126`).
- **Causa:** En el `catch` de `sendLog`, cualquier excepción al hacer `channels.fetch` o `channel.send` (incluidos timeouts de red, errores `5xx` de Discord o una falta temporal de permisos `50013`) ejecuta `GuildConfig.updateOne({ guildId }, { $unset: { logChannelId: "" } })`, desactivando permanentemente los logs del servidor.
- **Solución prevista en Lote B2:** Solo hacer `$unset` de `logChannelId` cuando Discord confirme que el canal ya no existe (`err?.code === 10003` Unknown Channel).

## 5. `events/error.js` atribuye cualquier error `50013` / `50006` a `EmbedLinks`
- **Archivo:** `events/error.js` (`resolveMissingBotPermissions`, `L47-49`).
- **Causa:** Cuando falla una llamada a la API de Discord con `50013` (`Missing Permissions`) o `50006` y el bot sí tiene `ViewChannel`, `SendMessages` y `EmbedLinks` en el canal, el fallback `if (!missing.length && isDiscordPermError(err)) missing.push("EmbedLinks")` informa al usuario que falta `EmbedLinks` aunque el permiso faltante sea `ManageRoles`, `BanMembers`, `ManageChannels`, etc.
- **Solución prevista en Lote B2:** No inventar `"EmbedLinks"` cuando `missing` está vacío; usar los permisos requeridos declarados por el comando/plugin o el fallback genérico.

## 6. `ticketActions.js` no detecta el rol de soporte en miembros no cacheados
- **Archivo:** `commands/interactions/ticketActions.js` (`isStaff`, `L90`).
- **Causa:** `interaction.member?.roles?.cache?.has(cfg.supportRoleId)` asume que `interaction.member.roles` es un `GuildMemberRoleManager`. Si el miembro no está en caché y Discord entrega un `APIGuildMember`, `interaction.member.roles` es un array de IDs (`string[]`), por lo que `.cache` es `undefined` y se rechaza al staff con rol de soporte que no tenga `ManageChannels`.
- **Solución prevista en Lote B2:** Comprobar `interaction.member?.roles?.cache?.has?.(cfg.supportRoleId) || (Array.isArray(interaction.member?.roles) && interaction.member.roles.includes(cfg.supportRoleId))`.

## 7. `ticketActions.js` (`claim`) actualiza tickets sin filtrar por `status: "open"`
- **Archivo:** `commands/interactions/ticketActions.js` (`claim`, `L99`).
- **Causa:** `Ticket.updateOne({ channelId: interaction.channelId }, { $set: { claimedBy: interaction.user.id } })` no incluye `status: "open"` en el filtro (a diferencia de la consulta previa en `L79`).
- **Solución prevista en Lote B2:** Filtrar por `{ channelId: interaction.channelId, status: "open" }` (o `{ _id: ticket._id, status: "open" }`).

## 8. `Expediente Mod` no revalida jerarquía del moderador en el colector
- **Archivo:** `src/contextMenus.js` (`handleModDossierContext`, `L428-545`).
- **Causa:** La comprobación de jerarquía entre el moderador que abrió el expediente y el usuario objetivo (`canTarget` en `L338-342`) solo se evalúa al renderizar la tarjeta inicial. Durante los 3 minutos de vida del colector, los handlers de `mute`, `kick` y `warn` comprueban permisos y `member?.moderatable` / `member?.kickable` (jerarquía del bot), pero no revalidan que el moderador siga estando por encima del objetivo (y en `warn` tampoco se valida jerarquía).
- **Solución prevista en Lote B2:** Revalidar la jerarquía del moderador frente al miembro objetivo dentro del colector antes de aplicar `mute`, `kick` o `warn`.
